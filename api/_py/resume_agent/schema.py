"""Spec section 8.2: the agreed resume JSON, its JSON Schema, and clean-up.

`normalise` takes anything shaped roughly like the schema (model output,
a request body, an older saved resume) and returns exactly the agreed shape:
every key present, strings trimmed, empty entries dropped, optional sections as
empty arrays. Wording is never changed apart from trimming whitespace and
removing characters Word cannot store.
"""
import copy
import json
import re

EMPTY_RESUME = {
    "candidate": {
        "full_name": "",
        "generic_job_title": "",
        "location": "",
        "phone": "",
        "email": "",
        "linkedin": "",
    },
    "professional_summary": "",
    "key_skills": [],
    "professional_experience": [],
    "education_and_training": [],
    "awards": [],
    "certifications": [],
    "technical_skills": [],
    "additional_information": [],
}

ENTRY_FIELDS = {
    "professional_experience": ["job_title", "employer", "location", "start_date", "end_date", "scope_statement", "achievements"],
    "education_and_training": ["qualification", "institution", "location", "completion_date", "details"],
    "awards": ["award_name", "issuing_organisation", "year", "details"],
    "certifications": ["certification_name", "issuing_body", "year_obtained", "expiry_date"],
    "technical_skills": ["category", "skills"],
    "additional_information": ["category", "details"],
}
LIST_FIELDS = {"achievements", "skills"}
# The field that must be filled for an entry to be kept.
ENTRY_KEY = {
    "professional_experience": ("job_title", "employer"),
    "education_and_training": ("qualification", "institution"),
    "awards": ("award_name",),
    "certifications": ("certification_name",),
    "technical_skills": ("skills",),
    "additional_information": ("details",),
}
LIMITS = {"string": 1500, "short": 200, "list": 20, "entries": 15}

_S = {"type": "string"}


def _obj(props):
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def _entry(section):
    return _obj({f: ({"type": "array", "items": _S} if f in LIST_FIELDS else _S) for f in ENTRY_FIELDS[section]})


RESUME_JSON_SCHEMA = _obj({
    "candidate": _obj({k: _S for k in EMPTY_RESUME["candidate"]}),
    "professional_summary": _S,
    "key_skills": {"type": "array", "items": _S},
    **{s: {"type": "array", "items": _entry(s)} for s in ENTRY_FIELDS},
})

# Characters Word (XML 1.0) cannot hold, plus zero-width junk from PDFs.
_BAD_CHARS = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿​‌‍⁠﻿]")


def clean_text(v, limit=LIMITS["string"]):
    if v is None:
        return ""
    s = _BAD_CHARS.sub("", str(v))
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\s*\n\s*", " ", s)
    return s.strip()[:limit]


def _list(v, n=LIMITS["list"], limit=LIMITS["string"]):
    if isinstance(v, str):
        v = [v]
    if not isinstance(v, list):
        return []
    return [x for x in (clean_text(i, limit) for i in v) if x][:n]


def normalise(data):
    """Return `data` in exactly the agreed schema (see module docstring)."""
    data = data if isinstance(data, dict) else {}
    out = copy.deepcopy(EMPTY_RESUME)
    c = data.get("candidate") if isinstance(data.get("candidate"), dict) else {}
    for k in out["candidate"]:
        out["candidate"][k] = clean_text(c.get(k), LIMITS["short"])
    out["professional_summary"] = clean_text(data.get("professional_summary"))
    out["key_skills"] = _list(data.get("key_skills"), 12, LIMITS["short"])
    for section, fields in ENTRY_FIELDS.items():
        rows = data.get(section)
        if not isinstance(rows, list):
            continue
        kept = []
        for row in rows[:LIMITS["entries"]]:
            if not isinstance(row, dict):
                continue
            entry = {}
            for f in fields:
                entry[f] = _list(row.get(f)) if f in LIST_FIELDS else clean_text(row.get(f), LIMITS["string"] if f in ("details", "scope_statement") else LIMITS["short"])
            if any(entry[k] for k in ENTRY_KEY[section]):
                kept.append(entry)
        out[section] = kept
    return out


def validate(data):
    """Problems that stop the JSON being accepted (empty list = valid).

    Checks the exact key set and types, so it also catches anything that
    did not come through `normalise`.
    """
    problems = []
    if not isinstance(data, dict):
        return ["The resume must be a JSON object."]
    if set(data) != set(EMPTY_RESUME):
        missing, extra = set(EMPTY_RESUME) - set(data), set(data) - set(EMPTY_RESUME)
        if missing:
            problems.append(f"Missing keys: {', '.join(sorted(missing))}.")
        if extra:
            problems.append(f"Unexpected keys: {', '.join(sorted(extra))}.")
    c = data.get("candidate")
    if not isinstance(c, dict) or set(c) != set(EMPTY_RESUME["candidate"]):
        problems.append("candidate must have exactly: " + ", ".join(EMPTY_RESUME["candidate"]) + ".")
    elif not all(isinstance(v, str) for v in c.values()):
        problems.append("candidate fields must be strings.")
    elif not c["full_name"].strip():
        problems.append("The candidate's full name is required (it is used in the filename).")
    if not isinstance(data.get("professional_summary"), str):
        problems.append("professional_summary must be a string.")
    if not isinstance(data.get("key_skills"), list) or not all(isinstance(s, str) for s in data.get("key_skills") or []):
        problems.append("key_skills must be an array of strings.")
    for section, fields in ENTRY_FIELDS.items():
        rows = data.get(section)
        if not isinstance(rows, list):
            problems.append(f"{section} must be an array (use [] when empty).")
            continue
        for i, row in enumerate(rows):
            if not isinstance(row, dict) or set(row) != set(fields):
                problems.append(f"{section}[{i}] must have exactly: {', '.join(fields)}.")
                continue
            for f in fields:
                ok = isinstance(row[f], list) and all(isinstance(x, str) for x in row[f]) if f in LIST_FIELDS else isinstance(row[f], str)
                if not ok:
                    problems.append(f"{section}[{i}].{f} has the wrong type.")
    return problems


def to_json(data):
    """Strict JSON text: double quotes, no comments, no trailing commas.

    Round-trips through json.loads so the caller can rely on it parsing.
    """
    text = json.dumps(data, ensure_ascii=False, indent=2)
    json.loads(text)
    return text


# ── Older shapes ──
def from_legacy(r):
    """Convert the earlier Resume-Generator / New Page shape
    ({name, contact, summary, experience[{title, company, dates, bullets}], ...})
    into the agreed schema, so saved resumes still open."""
    r = r if isinstance(r, dict) else {}
    if "candidate" in r:
        return normalise(r)
    c = r.get("contact") if isinstance(r.get("contact"), dict) else {}
    exp = []
    for e in r.get("experience") or []:
        if not isinstance(e, dict):
            continue
        dates = str(e.get("dates") or "")
        parts = re.split(r"\s+(?:–|—|-|to)\s+", dates, maxsplit=1)
        exp.append({
            "job_title": e.get("title"), "employer": e.get("company"), "location": e.get("location"),
            "start_date": parts[0] if parts else "", "end_date": parts[1] if len(parts) > 1 else "",
            "scope_statement": "", "achievements": e.get("bullets") or [],
        })
    tech = r.get("technical_skills")
    if isinstance(tech, dict):
        tech = [{"category": k, "skills": v} for k, v in tech.items()]
    return normalise({
        "candidate": {"full_name": r.get("name"), "location": c.get("location"), "phone": c.get("phone"), "email": c.get("email"), "linkedin": c.get("linkedin")},
        "professional_summary": r.get("summary") or r.get("professional_summary"),
        "key_skills": r.get("key_skills"),
        "professional_experience": exp,
        "education_and_training": [{"qualification": e.get("degree"), "institution": e.get("institution"), "completion_date": e.get("year") or e.get("graduation_year")} for e in r.get("education") or [] if isinstance(e, dict)],
        "awards": [{"award_name": a} for a in r.get("awards") or [] if isinstance(a, str)],
        "certifications": [{"certification_name": a} for a in r.get("certifications") or [] if isinstance(a, str)],
        "technical_skills": tech or [],
        "additional_information": [{"category": "", "details": a} for a in r.get("additional_information") or [] if isinstance(a, str)],
    })
