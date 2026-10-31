"""Deterministic checks on a draft before the candidate sees it.

`quality_issues` checks the spec's writing rules (sections 6.5 to 6.7 and 12);
`integrity_issues` looks for figures and employers that are not in the
candidate's own materials (section 13). The agent asks Claude to fix what
these find once, then shows anything left as a note to check.
"""
import re

US_SPELLINGS = re.compile(
    r"\b(organiz\w*|color(s|ed|ful)?|behavior\w*|analyz\w*|center(s|ed)?|labor|favorite\w*|honor(s|ed)?|"
    r"optimiz\w*|prioritiz\w*|realiz\w*|utiliz\w*|recogniz\w*|specializ\w*|customiz\w*|standardiz\w*|mobiliz\w*|"
    r"minimiz\w*|maximiz\w*|moderniz\w*|capitaliz\w*|characteriz\w*|categoriz\w*|summariz\w*|emphasiz\w*|"
    r"defense|enrollment|catalog|modeling|modeled|traveled|traveling|fulfill|percent)\b", re.I)
FIRST_PERSON = re.compile(r"\b(I|me|my|mine|myself|we|our|ours|us)\b")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐⭕]")
YEAR = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
# Established single skills that contain "and"; anything else with "and" is two skills.
COMPOUND_SKILLS = {
    "work health and safety", "workplace health and safety", "health and safety", "learning and development",
    "research and development", "mergers and acquisitions", "diversity and inclusion", "monitoring and evaluation",
    "governance risk and compliance", "repairs and maintenance", "accounts payable and receivable",
    "planning and scheduling", "occupational health and safety", "search and rescue", "food and beverage",
}
FIGURE = re.compile(r"(\$\s?\d[\d,.]*\s?(?:million|billion|thousand|k|m|b)?|\d[\d,.]*\s?(?:%|per\s?cent|percent)|\b\d{2,}[\d,]*\b)", re.I)


def _texts(d):
    yield d["professional_summary"]
    yield from d["key_skills"]
    for r in d["professional_experience"]:
        yield r["scope_statement"]
        yield from r["achievements"]
    for e in d["education_and_training"]:
        yield e["details"]
    for a in d["awards"]:
        yield a["details"]


def _sentences(text):
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text.strip()) if s.strip()]


def _first_year(text):
    m = YEAR.search(text or "")
    return int(m.group(1)) if m else None


def _is_current(end):
    return (end or "").strip().lower() in ("present", "current", "now", "")


def quality_issues(d):
    issues = []
    c = d["candidate"]
    if not c["full_name"]:
        issues.append("The candidate's full name is missing.")
    if not c["generic_job_title"]:
        issues.append("Add a generic or target job title under the name.")
    n = len(_sentences(d["professional_summary"]))
    if d["professional_summary"] and not 3 <= n <= 4:
        issues.append(f"The professional summary has {n} sentences; it must have three to four.")
    if not d["professional_summary"]:
        issues.append("The professional summary is missing.")
    k = len(d["key_skills"])
    if not 5 <= k <= 8:
        issues.append(f"Key skills has {k} entries; it must have five to eight.")
    tech = {s.lower() for g in d["technical_skills"] for s in g["skills"]}
    for s in d["key_skills"]:
        plain = re.sub(r"[^a-z ]", "", s.lower()).strip()
        if "&" in s or (re.search(r"\band\b|,|/|;", s) and plain not in COMPOUND_SKILLS):
            issues.append(f'Key skill "{s}" combines more than one skill or uses an ampersand; keep one skill per entry.')
        elif len(s.split()) > 5:
            issues.append(f'Key skill "{s}" is a long description; use a short skill name.')
        if s.lower() in tech:
            issues.append(f'Key skill "{s}" repeats the technical skills section.')
    for t in _texts(d):
        if not t:
            continue
        if FIRST_PERSON.search(t):
            issues.append(f'Remove first-person wording: "{t[:70]}".')
        if EMOJI.search(t):
            issues.append(f'Remove emojis: "{t[:70]}".')
        m = US_SPELLINGS.search(t)
        if m:
            issues.append(f'Use Australian spelling instead of "{m.group(0)}" (unless it is part of a proper name).')
    roles = d["professional_experience"]
    for i, r in enumerate(roles):
        label = r["job_title"] or r["employer"] or f"role {i + 1}"
        if not r["job_title"] or not r["employer"]:
            issues.append(f"{label}: both the position title and the employer are needed.")
        if not r["start_date"]:
            issues.append(f"{label}: the start date is missing.")
        if len(r["achievements"]) > 8:
            issues.append(f"{label}: has {len(r['achievements'])} bullets; use no more than eight.")
    if roles and len(roles[0]["achievements"]) < 3 and sum(len(r["achievements"]) for r in roles) >= 3:
        issues.append(f"The most recent role ({roles[0]['job_title']}) has fewer than three achievement bullets while older roles have more; weight the recent role more heavily if the materials support it.")
    starts = [_first_year(r["start_date"]) for r in roles]
    for i in range(1, len(roles)):
        a, b = starts[i - 1], starts[i]
        if a and b and b > a and not (_is_current(roles[i]["end_date"]) and _is_current(roles[i - 1]["end_date"])):
            issues.append("Professional experience is not in reverse chronological order.")
            break
    # Deduplicate while keeping order.
    return list(dict.fromkeys(issues))


def _digits(s):
    return re.sub(r"[^\d.]", "", s).strip(".")


def integrity_issues(d, materials):
    """Figures, employers and qualifications not found in the candidate's own materials."""
    src = (materials or "").lower()
    src_digits = set(re.findall(r"\d[\d,.]*", src))
    src_digits = {_digits(x) for x in src_digits} | {_digits(x).replace(",", "") for x in src_digits}
    issues = []
    if not src.strip():
        return issues
    for t in _texts(d):
        for m in FIGURE.finditer(t or ""):
            fig = m.group(0)
            num = _digits(fig)
            if not num or YEAR.fullmatch(num):
                continue
            after = t[m.end():m.end() + 8].lower()
            if re.match(r"\s*\+?\s*(years|yrs)", after):
                continue
            if num not in src_digits:
                issues.append(f'The figure "{fig.strip()}" does not appear in the candidate materials: "{t[:80]}".')
    for r in d["professional_experience"]:
        emp = r["employer"].lower()
        words = [w for w in re.findall(r"[a-z0-9]{3,}", emp) if w not in ("pty", "ltd", "limited", "the", "and", "inc", "group")]
        if emp and words and not any(w in src for w in words):
            issues.append(f'The employer "{r["employer"]}" does not appear in the candidate materials.')
    for e in d["education_and_training"]:
        q = e["qualification"].lower()
        words = [w for w in re.findall(r"[a-z]{4,}", q) if w not in ("bachelor", "master", "diploma", "certificate", "degree", "with", "honours", "advanced", "graduate")]
        if q and words and not any(w in src for w in words):
            issues.append(f'The qualification "{e["qualification"]}" does not appear in the candidate materials.')
    return list(dict.fromkeys(issues))
