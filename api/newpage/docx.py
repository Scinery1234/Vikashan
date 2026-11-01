"""Cover letter Word documents for New Page members, built with the Resume-Generator builder.

Resumes are written by api/newpage/resume.py (the four-phase resume agent).

POST JSON with a member session token:
  {action: 'cover',  data, template}  -> {docx (base64), html}
  {action: 'extract', filename, file (base64)} -> {text}
  {action: 'templates'} -> {templates: [...]}
Stateless: nothing is stored here.
"""
import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_py"))

import doc_builder as rb  # noqa: E402  (copied unchanged from Resume-Generator)
import cover_builder as cb  # noqa: E402
from np_auth import verify_session  # noqa: E402,F401  (re-exported for tests)
from resume_agent.extract import extract_text  # noqa: E402,F401

MAX_BODY = 4_000_000
TEMPLATE_IDS = [t["id"] for t in rb.TEMPLATE_LIST]


def respond(h, code, obj):
    raw = json.dumps(obj).encode()
    h.send_response(code)
    h.send_header("Content-Type", "application/json")
    h.send_header("Content-Length", str(len(raw)))
    h.end_headers()
    h.wfile.write(raw)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return respond(self, 413, {"error": "That file is too big. Keep it under 3 MB."})
            b = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return respond(self, 400, {"error": "Bad request."})

        if not verify_session(str(b.get("token") or "")):
            return respond(self, 401, {"error": "Please sign in again.", "code": "auth"})

        action = b.get("action")
        template = b.get("template") if b.get("template") in TEMPLATE_IDS else "modern"
        try:
            if action == "templates":
                return respond(self, 200, {"templates": rb.TEMPLATE_LIST})
            if action == "extract":
                text = extract_text(str(b.get("filename") or ""), base64.b64decode(b.get("file") or ""))
                if len(text.strip()) < 40:
                    return respond(self, 422, {"error": "We couldn’t read any text in that file. If it’s a scan or a picture, paste the text instead."})
                return respond(self, 200, {"text": text[:30000]})
            if action == "cover":
                data = b.get("data") or {}
                docx = cb.build_cover_docx_bytes(data, template)
                return respond(self, 200, {"docx": base64.b64encode(docx).decode(), "html": cb.build_cover_html(data, template)})
            return respond(self, 400, {"error": "Unknown action."})
        except ValueError as e:
            return respond(self, 422, {"error": str(e)})
        except Exception as e:  # keep the real reason in the Vercel log
            print("docx error:", repr(e), file=sys.stderr)
            return respond(self, 500, {"error": "We couldn’t build that file. Please try again."})

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
