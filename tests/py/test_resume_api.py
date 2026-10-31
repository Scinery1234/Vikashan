"""The New Page resume writer (api/newpage/resume.py). Run: python3 -m unittest discover -s tests/py

Claude is replaced by a fake; the Word file is really generated, run and validated.
"""
import base64, copy, hashlib, hmac, importlib.util, io, json, os, sys, time, unittest

os.environ["JWT_SECRET"] = "unit-secret"
os.environ["ANTHROPIC_API_KEY"] = "test"
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..", "..")
spec = importlib.util.spec_from_file_location("resumeapi", os.path.join(ROOT, "api", "newpage", "resume.py"))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
from resume_agent import claude  # noqa: E402  (on sys.path via resume.py)
from docx import Document  # noqa: E402

APPROVED = json.load(open(os.path.join(HERE, "fixtures", "approved_resume.json")))
SOURCE = open(os.path.join(HERE, "fixtures", "source_resume.txt")).read()


def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token(sub="member-1", typ="session"):
    secret = hmac.new(b"unit-secret", b"newpage-member-v1", hashlib.sha256).hexdigest()
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"typ": typ, "sub": sub, "exp": time.time() + 3600}).encode())
    sig = b64(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


def fake_ask(system, prompt, schema):
    return {"status": "draft", "questions": [], "resume": copy.deepcopy(APPROVED), "verification_notes": []}


class ResumeApi(unittest.TestCase):
    def setUp(self):
        self.real = claude.ask_structured
        claude.ask_structured = fake_ask
        api._calls.clear()

    def tearDown(self):
        claude.ask_structured = self.real

    def call(self, **b):
        return api.handle({"token": token(), **b})

    def test_needs_a_member_session(self):
        self.assertEqual(api.handle({"action": "start", "token": "nope"})[0], 401)
        self.assertEqual(api.handle({"action": "start", "token": token(typ="magic")})[0], 401)

    def test_four_phases_with_content_approval_gate(self):
        code, out = self.call(action="start", materials=SOURCE, job_description="Operations Manager", target_title="Operations Manager")
        self.assertEqual(code, 200)
        self.assertEqual(out["state"], "AWAITING_CONTENT_APPROVAL")
        self.assertEqual(out["messages"][0]["prompt"], "Approve content? Please reply “Yes” or provide the amendments required.")
        # Content approval is the only gate: "Yes" shows the JSON and builds the Word file in one turn.
        code, out = self.call(action="reply", session=out["session"], message="Yes")
        self.assertEqual(out["messages"][0]["heading"], "Phase 2, Prepare")
        self.assertEqual(json.loads(out["messages"][0]["json"]), APPROVED)
        self.assertNotIn("prompt", out["messages"][0])
        res = out["messages"][1]
        self.assertEqual(out["state"], "COMPLETED")
        self.assertTrue(res["ok"], res["message"])
        self.assertNotIn("script", res)
        self.assertEqual(res["message"], "Jordan_Smith_Operations_Manager_Resume.docx successfully generated.")
        self.assertEqual(Document(io.BytesIO(base64.b64decode(res["docx"]))).paragraphs[0].text, "JORDAN SMITH")

    def test_session_from_another_secret_is_rejected(self):
        _, out = self.call(action="start", materials=SOURCE)
        os.environ["JWT_SECRET"] = "rotated"
        try:
            code, body = api.handle({"token": token(), "action": "reply", "session": out["session"], "message": "Y"})
            self.assertEqual(code, 401)  # the member token itself no longer verifies
        finally:
            os.environ["JWT_SECRET"] = "unit-secret"
        code, body = self.call(action="reply", session=out["session"][:-4] + "abcd", message="Y")
        self.assertEqual((code, body["code"]), (401, "session"))

    def test_job_description_pdf_upload(self):
        with open(os.path.join(HERE, "fixtures", "job_description.pdf"), "rb") as f:
            code, out = self.call(action="extract", filename="job.pdf", file=base64.b64encode(f.read()).decode())
        self.assertEqual(code, 200)
        self.assertIn("Manhattan WMS", out["text"])
        self.assertEqual(self.call(action="extract", filename="x.exe", file="eHg=")[0], 422)

    def test_open_saved_resume_goes_to_the_approval_gate(self):
        code, out = self.call(action="open", resume={"name": "Ana Lee", "contact": {"email": "a@b.au"}, "summary": "S.", "experience": [{"title": "Chef", "company": "Bistro", "dates": "2020 – Present", "bullets": ["Ran kitchen"]}]})
        self.assertEqual((code, out["state"]), (200, "AWAITING_CONTENT_APPROVAL"))
        self.assertIn("ANA LEE", out["messages"][0]["text"])

    def test_claude_errors_become_friendly_messages(self):
        def boom(*a):
            raise claude.ClaudeError("refused")
        claude.ask_structured = boom
        code, out = self.call(action="start", materials=SOURCE)
        self.assertEqual(code, 422)
        self.assertNotIn("didn", out["error"])
        claude.ask_structured = lambda *a: (_ for _ in ()).throw(claude.ClaudeError("error", "404 model not found"))
        code, out = self.call(action="start", materials=SOURCE)
        self.assertEqual(code, 502)
        self.assertIn("Details: 404 model not found", out["error"])

    def test_out_of_credit_message(self):
        claude.ask_structured = lambda *a: (_ for _ in ()).throw(claude.ClaudeError("billing", "credit balance is too low"))
        code, out = self.call(action="start", materials=SOURCE)
        self.assertEqual(code, 503)
        self.assertIn("run out of credit", out["error"])

    def test_rate_limit(self):
        api._calls["member-1"].extend([time.time()] * api.LIMIT_PER_HOUR)
        self.assertEqual(self.call(action="start", materials=SOURCE)[0], 429)


if __name__ == "__main__":
    unittest.main()
