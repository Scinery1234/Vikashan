"""Fair-use limits for the $25-a-month Sky and tools membership, from Python.

Mirrors lib/newpage-usage.js: tools members get 3 resumes a month (Sydney time).
Talks to Supabase over REST with the service key, the same way the Node code does.
If Supabase can't be reached, the resume is allowed: a limit should never break
the writer for paying members.
"""
import datetime
import json
import os
import urllib.parse
import urllib.request
import zoneinfo

RESUMES_A_MONTH = 3


def _month_key():
    now = datetime.datetime.now(zoneinfo.ZoneInfo("Australia/Sydney"))
    return f"{now.year:04d}-{now.month:02d}"


def _rest(method, path, body=None, prefer=None):
    base = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not base or not key:
        raise RuntimeError("Supabase not configured")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{base.rstrip('/')}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=8) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def resume_allowance(member_id):
    """(ok, message). Non-tools members are always ok."""
    try:
        rows = _rest("GET", f"newpage_members?id=eq.{urllib.parse.quote(member_id)}&select=source")
        if not rows or rows[0].get("source") != "tools":
            return True, ""
        used = _rest("GET", f"newpage_usage?member_id=eq.{urllib.parse.quote(member_id)}&month=eq.{_month_key()}&kind=eq.resumes&select=count")
        n = used[0]["count"] if used else 0
        if n >= RESUMES_A_MONTH:
            return False, f"Your membership includes {RESUMES_A_MONTH} resumes a month, and you’ve used them. They reset on the 1st. Reply to any email from us if you need more."
        return True, ""
    except Exception as e:  # never block a member because the limit check failed
        print("resume allowance check failed:", repr(e))
        return True, ""


def resume_spend(member_id):
    try:
        rows = _rest("GET", f"newpage_members?id=eq.{urllib.parse.quote(member_id)}&select=source")
        if not rows or rows[0].get("source") != "tools":
            return
        month = _month_key()
        used = _rest("GET", f"newpage_usage?member_id=eq.{urllib.parse.quote(member_id)}&month=eq.{month}&kind=eq.resumes&select=count")
        n = used[0]["count"] if used else 0
        _rest("POST", "newpage_usage?on_conflict=member_id,month,kind", {"member_id": member_id, "month": month, "kind": "resumes", "count": n + 1}, prefer="resolution=merge-duplicates,return=minimal")
    except Exception as e:
        print("resume usage count failed:", repr(e))
