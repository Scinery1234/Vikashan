"""The four-phase agent (spec sections 5 to 11 and 14), host-independent.

A host (the FastAPI app, or the New Page Vercel function) calls `start` with
the candidate's materials and then `reply` with each message the candidate
sends. Every call returns the new agent messages and a sealed session string.
The session is signed with a server secret, so the state, and therefore the
approval gates, cannot be skipped by editing what the browser sends back.
"""
import base64
import hashlib
import hmac
import json
import time

from . import claude, lint, prompts
from .execute import generate_document
from .schema import from_legacy, normalise, to_json, validate
from .workflow import (APPROVE_PROMPT, EXECUTE_PROMPT, PHASE2_HEADING, State, advance,
                       classify_content_reply, classify_execution_reply)

MAX_MATERIALS = 40000
MAX_JD = 20000
SESSION_TTL = 7 * 24 * 3600


class AgentError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


# ── Sealed sessions ──
def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def seal(session, secret):
    body = _b64(json.dumps(session, ensure_ascii=False, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def unseal(token, secret):
    try:
        body, sig = str(token).rsplit(".", 1)
        want = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(want, sig):
            raise ValueError
        session = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if time.time() - float(session.get("t", 0)) > SESSION_TTL:
            raise ValueError
        return session
    except Exception:
        raise AgentError("session", "This resume session has expired. Please start again.") from None


# ── Drafting ──
def draft_text(d):
    """The draft as readable text, in the spec's section order."""
    c = d["candidate"]
    out = [c["full_name"].upper() or "[NAME]"]
    if c["generic_job_title"]:
        out.append(c["generic_job_title"])
    contact = " | ".join(x for x in (c["location"], c["phone"], c["email"]) if x)
    if contact:
        out.append(contact)
    if c["linkedin"]:
        out.append(c["linkedin"])

    def section(title, lines):
        if lines:
            out.extend(["", title.upper(), *lines])

    section("Professional Summary", [d["professional_summary"]] if d["professional_summary"] else [])
    section("Key Skills", [f"• {s}" for s in d["key_skills"]])
    exp = []
    for i, r in enumerate(d["professional_experience"]):
        if i:
            exp.append("")
        exp.append(" | ".join(x for x in (r["job_title"], r["employer"], r["location"]) if x))
        dates = " to ".join(x for x in (r["start_date"], r["end_date"]) if x)
        if dates:
            exp.append(dates)
        if r["scope_statement"]:
            exp.append(r["scope_statement"])
        exp += [f"• {a}" for a in r["achievements"]]
    section("Professional Experience", exp)
    section("Education and Training", [" | ".join(x for x in (e["qualification"], e["institution"], e["location"], e["completion_date"]) if x) + (f"\n{e['details']}" if e["details"] else "") for e in d["education_and_training"]])
    section("Awards", [f"• " + ", ".join(x for x in (a["award_name"], a["issuing_organisation"], a["year"]) if x) + (f". {a['details']}" if a["details"] else "") for a in d["awards"]])
    section("Certifications", [f"• " + ", ".join(x for x in (x0["certification_name"], x0["issuing_body"], x0["year_obtained"], f"expires {x0['expiry_date']}" if x0["expiry_date"] else "") if x) for x0 in d["certifications"]])
    section("Technical Skills", [f"• {g['category'] + ': ' if g['category'] else ''}{', '.join(g['skills'])}" for g in d["technical_skills"]])
    section("Additional Information", [f"• {i['category'] + ': ' if i['category'] else ''}{i['details']}" for i in d["additional_information"]])
    return "\n".join(out)


def _sources(s):
    return "\n\n".join(x for x in (s["materials"], s.get("additional", ""), s.get("answers", "")) if x)


def _write(s, ask, prompt):
    """One drafting or revision call, then the automatic checks and one repair."""
    out = ask(prompts.SYSTEM_PROMPT, prompt, prompts.DRAFT_RESPONSE_SCHEMA)
    resume = normalise(out.get("resume"))
    notes = [str(n).strip() for n in out.get("verification_notes") or [] if str(n).strip()][:10]
    status = "questions" if out.get("status") == "questions" and out.get("questions") else "draft"
    questions = [str(q).strip() for q in out.get("questions") or [] if str(q).strip()][:6] if status == "questions" else []
    issues = lint.quality_issues(resume) + lint.integrity_issues(resume, _sources(s))
    if issues and status == "draft":
        try:
            fixed = ask(prompts.SYSTEM_PROMPT, prompts.build_repair_prompt(resume, issues, _sources(s)), prompts.DRAFT_RESPONSE_SCHEMA)
            resume = normalise(fixed.get("resume"))
            notes = list(dict.fromkeys(notes + [str(n).strip() for n in fixed.get("verification_notes") or [] if str(n).strip()]))[:10]
        except claude.ClaudeError:
            pass
        left = lint.integrity_issues(resume, _sources(s)) + lint.quality_issues(resume)
        notes += [f"Please check: {i}" for i in left[:5]]
    s.update(resume=resume, notes=notes, questions=questions)
    return status


def _draft_messages(s, status):
    if status == "questions":
        return [{"kind": "questions", "questions": s["questions"], "resume": s["resume"],
                 "text": "Before I can finish the draft, I need a few details. Please answer these in one reply:"}]
    return [{"kind": "draft", "text": draft_text(s["resume"]), "resume": s["resume"], "notes": s["notes"], "prompt": APPROVE_PROMPT}]


def _out(s, secret, messages):
    s["t"] = time.time()
    return {"state": s["state"], "session": seal(s, secret), "messages": messages, "resume": s.get("resume")}


def _clip(v, n):
    return str(v or "").strip()[:n]


def start(materials, secret, job_description="", target_title="", additional="", ask=None):
    """Phase 1: draft the resume from the candidate's materials."""
    ask = ask or claude.ask_structured
    materials = _clip(materials, MAX_MATERIALS)
    if len(materials) < 80:
        raise AgentError("input", "Add your current resume or career notes first: upload a file or paste your roles, dates and achievements.")
    s = {"v": 1, "state": State.DRAFTING.value, "materials": materials, "job_description": _clip(job_description, MAX_JD),
         "target_title": _clip(target_title, 200), "additional": _clip(additional, 6000), "answers": "",
         "resume": None, "notes": [], "questions": []}
    status = _write(s, ask, prompts.build_draft_prompt(s["materials"], s["job_description"], s["target_title"], s["additional"]))
    if status == "draft":
        s["state"] = advance(State.DRAFTING, "drafted").value
    return _out(s, secret, _draft_messages(s, status))


def resume_session(resume, secret, materials="", job_description="", target_title=""):
    """Open a saved resume (either shape) at the content approval gate, for amendments or a new Word file."""
    d = from_legacy(resume)
    s = {"v": 1, "state": State.AWAITING_CONTENT_APPROVAL.value, "materials": _clip(materials, MAX_MATERIALS) or draft_text(d),
         "job_description": _clip(job_description, MAX_JD), "target_title": _clip(target_title, 200), "additional": "",
         "answers": "", "resume": d, "notes": [], "questions": []}
    return _out(s, secret, _draft_messages(s, "draft"))


def _revise(s, ask, amendments):
    s["state"] = State.DRAFTING.value
    if s.get("questions"):
        s["answers"] = (s.get("answers", "") + "\n" + amendments).strip()[:6000]
        status = _write(s, ask, prompts.build_draft_prompt(s["materials"], s["job_description"], s["target_title"], s["additional"], s["answers"]))
    else:
        status = _write(s, ask, prompts.build_revision_prompt(s["resume"], amendments, _sources(s), s["job_description"], s["target_title"]))
    if status == "draft":
        s["state"] = advance(State.DRAFTING, "drafted").value
    return _draft_messages(s, status)


def _prepare(s):
    """Phase 2: the approved draft as strict JSON (wording unchanged)."""
    s["state"] = State.PREPARING_JSON.value
    data = normalise(s["resume"])
    problems = validate(data)
    if problems:
        s["state"] = State.AWAITING_CONTENT_APPROVAL.value
        return [{"kind": "text", "text": "The draft is missing something the Word file needs: " + " ".join(problems) + " Please add it."},
                {"kind": "text", "text": APPROVE_PROMPT}]
    s["resume"] = data
    s["state"] = advance(State.PREPARING_JSON, "json_ready").value
    return [{"kind": "json", "heading": PHASE2_HEADING, "json": to_json(data), "prompt": EXECUTE_PROMPT}]


def _generate(s):
    """Phases 3 and 4: script, execute, validate (with one corrected retry inside)."""
    s["state"] = advance(s["state"], "execute" if s["state"] == State.AWAITING_EXECUTION_APPROVAL.value else "retry").value
    s["state"] = advance(State.GENERATING_SCRIPT, "script_ready").value
    r = generate_document(s["resume"], s.get("target_title", ""))
    s["state"] = advance(State.EXECUTING_SCRIPT, "validated" if r["ok"] else "failed").value
    s["filename"] = r.get("filename", "")
    result = {"kind": "result", "ok": r["ok"], "filename": r.get("filename", ""), "message": r["message"],
              "script": r.get("script", ""), "attempts": [{k: a[k] for k in ("exit_code", "stdout", "stderr", "files")} for a in r.get("attempts", [])],
              "validation": r.get("validation"), "visual": r.get("visual")}
    for a in result["attempts"]:
        a["files"] = [{"filename": f["filename"], "size_bytes": f["size_bytes"]} for f in a["files"]]
    if r["ok"]:
        result["docx"] = base64.b64encode(r["docx"]).decode()
    return [result]


def reply(token, message, secret, ask=None):
    """Handle one message from the candidate."""
    ask = ask or claude.ask_structured
    s = unseal(token, secret)
    msg = _clip(message, 6000)
    state = State(s["state"])

    if state == State.DRAFTING:
        # Waiting for answers to the agent's questions.
        if not msg:
            return _out(s, secret, _draft_messages(s, "questions"))
        return _out(s, secret, _revise(s, ask, msg))

    if state == State.AWAITING_CONTENT_APPROVAL:
        kind = classify_content_reply(msg)
        if kind == "approve":
            s["state"] = advance(state, "approve").value
            return _out(s, secret, _prepare(s))
        if kind == "unclear":
            return _out(s, secret, [{"kind": "text", "text": APPROVE_PROMPT}])
        return _out(s, secret, _revise(s, ask, msg))

    if state == State.AWAITING_EXECUTION_APPROVAL:
        kind = classify_execution_reply(msg)
        if kind == "execute":
            return _out(s, secret, _generate(s))
        if kind == "unclear":
            return _out(s, secret, [{"kind": "text", "text": EXECUTE_PROMPT}])
        return _out(s, secret, _revise(s, ask, msg))

    if state == State.EXECUTION_FAILED and classify_execution_reply(msg) == "execute":
        return _out(s, secret, _generate(s))

    # COMPLETED or EXECUTION_FAILED: anything else is an amendment, which reopens the draft.
    if classify_content_reply(msg) != "amend":
        done = "Your Word resume is ready above. To change anything, tell me what to amend and I’ll redraft it for your approval."
        if state == State.EXECUTION_FAILED:
            done = "Reply Y to correct the script and try again, or tell me what to amend."
        return _out(s, secret, [{"kind": "text", "text": done}])
    return _out(s, secret, _revise(s, ask, msg))
