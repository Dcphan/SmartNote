# reader.py
import tempfile
from fastapi import UploadFile, HTTPException
from PyPDF2 import PdfReader
from docx import Document


class FileReader:
    """Class to read text from uploaded files (PDF, DOCX, TXT)."""

    def __init__(self, file: UploadFile):
        self.file = file

    def extract_text(self) -> str:
        """Extract text content from the uploaded file."""
        try:
            contents = self.file.file.read()
            # Write to temp file for libraries needing a path
            with tempfile.NamedTemporaryFile(delete=False, suffix=self.file.filename) as tmp:
                tmp.write(contents)
                tmp_path = tmp.name

            lower = (self.file.filename or "").lower()
            if lower.endswith(".pdf"):
                reader = PdfReader(tmp_path)
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
            elif lower.endswith(".docx"):
                doc = Document(tmp_path)
                text = "\n".join(p.text for p in doc.paragraphs)
            else:
                text = contents.decode("utf-8", errors="ignore")

            return text.strip()

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file: {e}")
