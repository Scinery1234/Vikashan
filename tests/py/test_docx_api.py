"""Run with: python3 -m unittest discover -s tests/py"""
import base64, hashlib, hmac, importlib.util, io, json, os, sys, time, unittest

os.environ["JWT_SECRET"] = "unit-secret"
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
spec = importlib.util.spec_from_file_location("docxapi", os.path.join(ROOT, "api", "newpage", "docx.py"))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
import doc_builder as rb  # noqa: E402
import cover_builder as cb  # noqa: E402


def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token(typ="session", exp=None):
    secret = hmac.new(b"unit-secret", b"newpage-member-v1", hashlib.sha256).hexdigest()
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"typ": typ, "sub": "x", "exp": exp or time.time() + 3600}).encode())
    sig = b64(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


class Docx(unittest.TestCase):
    def test_token(self):
        self.assertTrue(api.verify_session(token()))
        self.assertFalse(api.verify_session(token("magic")))
        self.assertFalse(api.verify_session(token(exp=time.time() - 5)))
        self.assertFalse(api.verify_session(token()[:-3] + "abc"))
        self.assertFalse(api.verify_session(""))

    def test_resume_all_templates(self):
        for t in [x["id"] for x in rb.TEMPLATE_LIST]:
            data = rb.ResumeBuilder().build_word_document_bytes(rb.DUMMY_CANDIDATE, t)
            self.assertEqual(data[:2], b"PK")

    def test_cover(self):
        c = {"name": "Sam", "contact": {"phone": "1"}, "paragraphs": ["a", "b"], "recipient": ["Hiring Manager"], "date": "1 January 2027"}
        self.assertEqual(cb.build_cover_docx_bytes(c, "classic")[:2], b"PK")
        self.assertIn("Dear Hiring Manager", cb.build_cover_html(c, "minimal"))

    def test_extract_docx_and_txt(self):
        data = rb.ResumeBuilder().build_word_document_bytes(rb.DUMMY_CANDIDATE, "classic")
        self.assertIn("Atlassian", api.extract_text("a.docx", data))
        self.assertEqual(api.extract_text("a.txt", b"hello"), "hello")
        with self.assertRaises(ValueError):
            api.extract_text("a.exe", b"x")


if __name__ == "__main__":
    unittest.main()
