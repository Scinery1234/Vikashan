"""Australian resume agent: draft, approve, JSON, python-docx script, execute, validate.

The spec this package implements is docs/RESUME_AGENT_SPEC.md. Everything here
is plain Python with python-docx and pypdf, so the same files run in the
FastAPI app and, copied unchanged, in the Vikashan New Page Vercel function
(api/_py/resume_agent).
"""
from .schema import EMPTY_RESUME, RESUME_JSON_SCHEMA, normalise, validate, to_json  # noqa: F401
from .filename import sanitise_filename, resume_filename  # noqa: F401
from .workflow import State, classify_content_reply, classify_execution_reply  # noqa: F401
