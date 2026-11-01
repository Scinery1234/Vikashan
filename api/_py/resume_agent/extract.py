"""Text from uploaded resumes, job descriptions, certificates and notes."""
import io

MAX_CHARS = 30000


def extract_text(filename, content):
    """Plain text from a .docx, .pdf, .txt, .md or .rtf upload. ValueError for anything else."""
    name = (filename or "").lower()
    if name.endswith(".docx"):
        from docx import Document
        doc = Document(io.BytesIO(content))
        lines = [p.text for p in doc.paragraphs if p.text.strip()]
        for t in doc.tables:
            for row in t.rows:
                cells = []
                for cell in row.cells:
                    txt = " ".join(p.text for p in cell.paragraphs if p.text.strip())
                    if txt and txt not in cells:
                        cells.append(txt)
                if cells:
                    lines.append(" | ".join(cells))
        return "\n".join(lines)[:MAX_CHARS]
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(content))
            if reader.is_encrypted:
                reader.decrypt("")
            text = "\n".join(t for t in (pg.extract_text() or "" for pg in reader.pages) if t)
        except Exception as e:  # noqa: BLE001
            raise ValueError("We couldn’t open that PDF. If it’s password protected, remove the password or paste the text.") from e
        return text[:MAX_CHARS]
    if name.endswith((".txt", ".md", ".rtf")):
        return content.decode("utf-8", errors="ignore")[:MAX_CHARS]
    raise ValueError("Upload a Word (.docx), PDF or text file.")
