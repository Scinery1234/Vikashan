"""The New Page resume writer: the four-phase Australian resume agent.

Runs resume_agent (api/_py/resume_agent, copied unchanged from
Resume-Generator; spec in its docs/RESUME_AGENT_SPEC.md):
draft -> "Approve content?" -> Phase 2 JSON -> "Reply Y" -> python-docx
script executed and validated -> .docx.

POST JSON with a member session token:
  {action: 'extract', filename, file (base64)}              -> {text}
  {action: 'start', materials, job_description, target_title, additional}
  {action: 'reply', session, message}
  {action: 'open', resume, materials, job_description, target_title}
start/reply/open -> {state, session, messages, resume}. The session string is
signed here, so the approval gates cannot be skipped from the browser.
Saving the finished resume to the member's documents is done by
/api/newpage/app (action resume_save), which owns the database.
"""
import base64
import json
import os
import sys
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_py"))

from np_auth import derived_secret, session_claims  # noqa: E402
from resume_agent import agent  # noqa: E402
from resume_agent.claude import ClaudeError  # noqa: E402
from resume_agent.extract import extract_text  # noqa: E402

MAX_BODY = 4_400_000
MAX_FILE = 3 * 1024 * 1024  # base64 in JSON must stay under Vercel's 4.5 MB request limit
LIMIT_PER_HOUR = 40  # drafts and revisions per member per warm instance
_calls = defaultdict(deque)

CLAUDE_ERRORS = {
    "unavailable": (503, "The writer isn’t switched on yet."),
    "rate_limited": (429, "The writer is busy right now. Please try again in a minute."),
    "overloaded": (503, "The writer is busy right now. Please try again in a minute."),
    "refused": (422, "The writer couldn’t work with that. Check it is your resume or career notes and try again."),
    "truncated": (502, "The draft was too long to finish. Try trimming very old roles from your materials."),
    "error": (502, "The writer couldn’t finish. Please try again in a minute."),
}


def secret():
    return derived_secret(b"newpage-resume-agent-v1")


def limited(member_id):
    q, now = _calls[member_id], time.time()
    while q and q[0] < now - 3600:
        q.popleft()
    if len(q) >= LIMIT_PER_HOUR:
        return True
    q.append(now)
    return False


def respond(h, code, obj):
    raw = json.dumps(obj).encode()
    h.send_response(code)
    h.send_header("Content-Type", "application/json")
    h.send_header("Cache-Control", "no-store")
    h.send_header("Content-Length", str(len(raw)))
    h.end_headers()
    h.wfile.write(raw)


def handle(b):
    """(status, body) for one request body. Separate from HTTP so it can be tested directly."""
    claims = session_claims(str(b.get("token") or ""))
    if not claims:
        return 401, {"error": "Please sign in again.", "code": "auth"}
    action = b.get("action")

    if action == "extract":
        try:
            content = base64.b64decode(b.get("file") or "", validate=False)
        except Exception:
            return 400, {"error": "We couldn’t read that file."}
        if len(content) > MAX_FILE:
            return 413, {"error": "That file is over 3 MB. Try a smaller one, or paste the text."}
        try:
            text = extract_text(str(b.get("filename") or ""), content)
        except ValueError as e:
            return 422, {"error": str(e)}
        if len(text.strip()) < 40:
            return 422, {"error": "We couldn’t read any text in that file. If it’s a scan or a picture, paste the text instead."}
        return 200, {"text": text}

    if action not in ("start", "reply", "open"):
        return 400, {"error": "Unknown action."}
    if action != "open" and not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return 503, {"error": "The writer isn’t switched on yet.", "code": "coach_off"}
    if action != "open" and limited(str(claims.get("sub"))):
        return 429, {"error": "That’s a lot of drafts for one hour. Please try again a little later."}
    try:
        if action == "start":
            return 200, agent.start(str(b.get("materials") or ""), secret(), job_description=str(b.get("job_description") or ""),
                                    target_title=str(b.get("target_title") or ""), additional=str(b.get("additional") or ""))
        if action == "reply":
            return 200, agent.reply(str(b.get("session") or ""), str(b.get("message") or ""), secret())
        resume = b.get("resume") if isinstance(b.get("resume"), dict) else {}
        return 200, agent.resume_session(resume, secret(), materials=str(b.get("materials") or ""),
                                         job_description=str(b.get("job_description") or ""), target_title=str(b.get("target_title") or ""))
    except agent.AgentError as e:
        return (401 if e.code == "session" else 400), {"error": str(e), "code": e.code}
    except ClaudeError as e:
        print("resume agent:", e.code, str(e)[:500], file=sys.stderr)
        status, msg = CLAUDE_ERRORS.get(e.code, CLAUDE_ERRORS["error"])
        if e.code == "error":
            # Say why, so a setup problem (API key, model access) can be seen without the server log.
            msg = f"{msg} (Details: {str(e)[:400]})"
        return status, {"error": msg, "code": e.code}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return respond(self, 413, {"error": "That’s too much text. Keep files under 3 MB."})
            b = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(b, dict):
                raise ValueError
        except Exception:
            return respond(self, 400, {"error": "Bad request."})
        try:
            code, body = handle(b)
        except Exception as e:  # keep the real reason in the Vercel log
            print("resume agent error:", repr(e), file=sys.stderr)
            code, body = 500, {"error": "Something went wrong. Please try again."}
        return respond(self, code, body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
