# ai_client.py
import os
from openai import OpenAI
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

class NoteAI:
    """Class to generate structured notes using OpenAI."""

    def __init__(self, api_key: str = None):
        if api_key is None:
            api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        self.client = OpenAI(api_key=api_key)

    def summarize_notes(self, raw_text: str) -> dict:
        """Send text to OpenAI and get structured notes as JSON."""
        prompt = f"""
    Return ONLY valid JSON in this form:
    {{"Class": "<title>", "Topics": {{"<topic>": ["note1","note2"]}}}}

    Convert this text into that structure:
    {raw_text}
    """

        resp = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You return JSON only, no Markdown or explanation."},
                {"role": "user", "content": prompt}
            ],
            temperature=0
        )

        txt = resp.choices[0].message.content.strip()

        # quick clean & parse
        import json, re
        try:
            return json.loads(txt)
        except Exception:
            # try to extract JSON if model wrapped it in code fences
            m = re.search(r"\{[\s\S]*\}", txt)
            if m:
                return json.loads(m.group(0))
            raise ValueError("Model did not return valid JSON:\n" + txt)

