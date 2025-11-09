# notes_db.py (supabase-only)
import os
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

load_dotenv()

try:
    from supabase import create_client, Client as SupabaseClient
except Exception as e:
    raise RuntimeError("supabase package not installed. Install with: pip install supabase") from e

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY environment variables (service_role key).")


def _resp_ok_extract(res: Any, ctx: str = "") -> Any:
    """
    Robustly extract data from Supabase client response.
    Raises RuntimeError if response signals an error.
    """
    # object with status_code (newer versions)
    if hasattr(res, "status_code"):
        status = getattr(res, "status_code", None)
        data = getattr(res, "data", None)
        err = getattr(res, "error", None)
        if status and status >= 400:
            raise RuntimeError(f"{ctx} Supabase HTTP {status}: {err or data}")
        if err:
            raise RuntimeError(f"{ctx} Supabase error: {err}")
        return data

    # object with .data and .error (older versions)
    if hasattr(res, "data") or hasattr(res, "error"):
        data = getattr(res, "data", None)
        err = getattr(res, "error", None)
        if err:
            raise RuntimeError(f"{ctx} Supabase error: {err}")
        return data

    # dict-like
    if isinstance(res, dict):
        if res.get("error"):
            raise RuntimeError(f"{ctx} Supabase error: {res.get('error')}")
        return res.get("data") or res

    # fallback: return as-is
    return getattr(res, "data", res)


class NotesDatabase:

    def __init__(self):
        self.supabase: SupabaseClient = create_client(SUPABASE_URL, SUPABASE_KEY)

    def verify_notes(self, notes: Dict[str, Any]) -> None:
        if not isinstance(notes, dict):
            raise ValueError("Notes must be a dictionary.")
        if "Class" not in notes or "Topics" not in notes:
            raise ValueError("Notes must have 'Class' and 'Topics'.")
        if not isinstance(notes["Topics"], dict):
            raise ValueError("'Topics' must be a dictionary.")
        for topic, items in notes["Topics"].items():
            if not isinstance(topic, str):
                raise ValueError("Topic keys must be strings.")
            if not isinstance(items, list):
                raise ValueError(f"Topic '{topic}' must have a list of notes.")
            for note in items:
                if not isinstance(note, str):
                    raise ValueError("All notes must be strings.")

    def save_notes(self, notes: Dict[str, Any]) -> int:
        """
        Insert notes into tables classes -> topics -> notes.
        Returns inserted class_id (int).
        Note: not transactional across HTTP calls; for atomicity use direct Postgres.
        """
        self.verify_notes(notes)

        # 1) insert class
        cls_res = self.supabase.table("classes").insert({"name": notes.get("Class", "Untitled")}).execute()
        cls_data = _resp_ok_extract(cls_res, "Insert class failed.")
        if not cls_data or not isinstance(cls_data, list):
            raise RuntimeError("Unexpected response inserting class.")
        class_id = cls_data[0].get("id")
        if class_id is None:
            raise RuntimeError("Inserted class id not found.")

        # 2) bulk insert topics
        topics_payload = [{"class_id": class_id, "title": t, "ord": i}
                          for i, t in enumerate(notes.get("Topics", {}).keys())]
        inserted_topics: List[dict] = []
        if topics_payload:
            topics_res = self.supabase.table("topics").insert(topics_payload).execute()
            topics_data = _resp_ok_extract(topics_res, "Insert topics failed.")
            if not topics_data:
                raise RuntimeError("No topics returned after insert.")
            inserted_topics = topics_data

        # map title -> id
        title_to_id = {r["title"]: r["id"] for r in inserted_topics if "title" in r and "id" in r}

        # 3) bulk insert notes
        notes_payload = []
        for title, note_list in notes.get("Topics", {}).items():
            topic_id = title_to_id.get(title)
            if topic_id is None:
                # defensive: fetch topic id
                sel = self.supabase.table("topics").select("id").eq("class_id", class_id).eq("title", title).execute()
                sel_data = _resp_ok_extract(sel, f"Fetch topic id for '{title}' failed.")
                if sel_data and len(sel_data) > 0:
                    topic_id = sel_data[0]["id"]
                else:
                    raise RuntimeError(f"Topic id for '{title}' not found.")
            for n_ord, note in enumerate(note_list):
                notes_payload.append({"topic_id": topic_id, "content": note, "ord": n_ord})

        if notes_payload:
            notes_res = self.supabase.table("notes").insert(notes_payload).execute()
            _resp_ok_extract(notes_res, "Insert notes failed.")

        return class_id

    def save_notes_with_raw(self, notes: Dict[str, Any], raw_text: Optional[str] = None) -> int:
        """
        Save notes and optionally store raw_text into raw_resp (best-effort).
        """
        class_id = self.save_notes(notes)

        if raw_text:
            try:
                raw_res = self.supabase.table("raw_resp").insert({"class_id": class_id, "raw_text": raw_text}).execute()
                # best-effort: ignore if fails
                try:
                    _resp_ok_extract(raw_res, "Insert raw_resp failed.")
                except RuntimeError:
                    pass
            except Exception:
                pass

        return class_id


    def get_classes(self) -> List[Dict[str, Any]]:
        res = self.supabase.table("classes").select("*").execute()
        return _resp_ok_extract(res, "classes")

    # 2️⃣ Fetch topics for a class
    def get_topics(self, class_id: int) -> List[Dict[str, Any]]:
        res = (
            self.supabase.table("topics")
            .select("*")
            .eq("class_id", class_id)
            .order("ord")
            .execute()
        )
        return _resp_ok_extract(res, f"topics (class_id={class_id})")

    # 3️⃣ Fetch notes for a topic
    def get_notes(self, topic_id: int) -> List[Dict[str, Any]]:
        res = (
            self.supabase.table("notes")
            .select("*")
            .eq("topic_id", topic_id)
            .order("ord")
            .execute()
        )
        return _resp_ok_extract(res, f"notes (topic_id={topic_id})")

    # 4️⃣ Optional helper: fetch class with topics & notes (on demand)
    def get_class_hierarchy(self, class_id: int) -> Dict[str, Any]:
        """Fetch one class and its topics (and notes for each topic)."""
        # Get class
        class_data = self.supabase.table("classes").select("*").eq("id", class_id).execute()
        classes = _resp_ok_extract(class_data, f"class id={class_id}")
        if not classes:
            return {}

        c = classes[0]
        hierarchy = {"id": c["id"], "name": c["name"], "topics": {}}

        # Get topics
        topics = self.get_topics(class_id)
        for t in topics:
            hierarchy["topics"][t["id"]] = {"title": t["title"], "notes": self.get_notes(t["id"])}

        return hierarchy

    def close(self):
        # supabase client doesn't need explicit close; kept for compat
        return
