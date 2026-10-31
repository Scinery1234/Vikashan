"""Spec section 10: Candidate_Name_Generic_Job_Title_Resume.docx."""
import re


def sanitise_filename(full_name, job_title, fallback_title="", max_length=120):
    """Build a safe Windows/macOS/Linux filename from the candidate's name and title."""
    def clean(part):
        part = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(part or ""))
        part = re.sub(r"[^\w\s.'-]", "", part, flags=re.UNICODE)
        return re.sub(r"\s+", "_", part.strip())

    name = clean(full_name) or "Candidate"
    title = clean(job_title) or clean(fallback_title) or "Professional"
    stem = re.sub(r"_+", "_", f"{name}_{title}_Resume")
    if len(stem) > max_length:
        keep = max_length - len("_Resume")
        stem = stem[:-len("_Resume")][:keep].rstrip("._ ") + "_Resume"
    stem = stem.strip("._ ")
    return f"{stem}.docx"


def resume_filename(data, fallback_title=""):
    c = (data or {}).get("candidate") or {}
    return sanitise_filename(c.get("full_name"), c.get("generic_job_title"), fallback_title)
