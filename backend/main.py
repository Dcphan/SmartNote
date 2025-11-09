from fastapi import FastAPI, Request, File, UploadFile, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import uvicorn
import os
from typing import Dict, Any, Optional, List
from reader import FileReader
from open_api import NoteAI
from database import NotesDatabase

app = FastAPI()
note_ai = NoteAI()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    notes_db = NotesDatabase()
else:
    # raise at startup so the developer knows credentials are missing
    raise RuntimeError("Set SUPABASE_URL & SUPABASE_KEY (or SUPABASE_DSN) in env")

BASE_DIR = os.getcwd()
TEMPLATE_DIR = os.path.join(BASE_DIR, "frontend", "templates")
templates = Jinja2Templates(directory=TEMPLATE_DIR)

STATIC_DIR = os.path.join(BASE_DIR, "frontend", "static")
print("Static dir:", STATIC_DIR)
# ensure static dir exists (optional; will raise if missing)
if not os.path.isdir(STATIC_DIR):
    # warn but continue; you can create it or change this behavior
    print(f"Warning: static directory '{STATIC_DIR}' does not exist.")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class NotesPayload(BaseModel):
    # use pythonic attribute names but accept incoming JSON keys "Class" and "Topics"
    class_name: str = Field(..., alias="Class")
    topics: Dict[str, List[str]] = Field(..., alias="Topics")
    raw_text: Optional[str] = None  # optional audit raw text

    class Config:
        allow_population_by_field_name = True
        # allow aliases (incoming JSON) to populate fields
        allow_population_by_alias = True


@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("note.html", {"request": request})


@app.post("/read-file")
async def read_file(file: UploadFile = File(...)):
    """
    If FileReader accepts UploadFile this is fine. If FileReader expects a path/string,
    adjust FileReader usage (e.g., save to a temp file and pass the path).
    """
    # If FileReader does blocking I/O, consider running in threadpool (see suggestions).
    reader = FileReader(file)
    text = reader.extract_text()
    summarize_note = note_ai.summarize_notes(text)
    # make sure returned object is serializable (dict/list/str)
    return JSONResponse(status_code=status.HTTP_200_OK, content=summarize_note)


@app.post("/store")
def store_notes(payload: NotesPayload):
    # Normalize and validate topic keys & note values
    normalized_topics: Dict[str, List[str]] = {}
    for topic, notes in payload.topics.items():
        if not isinstance(topic, str):
            raise HTTPException(status_code=400, detail="All topic keys must be strings.")
        if not isinstance(notes, list):
            raise HTTPException(status_code=400, detail=f"Topic '{topic}' must be a list.")
        if not all(isinstance(n, str) for n in notes):
            raise HTTPException(status_code=400, detail=f"All notes in topic '{topic}' must be strings.")
        normalized_topics[topic.strip()] = [n.strip() for n in notes]

    notes_dict = {"Class": payload.class_name.strip(), "Topics": normalized_topics}

    try:
        # prefer save_notes_with_raw if available
        if hasattr(notes_db, "save_notes_with_raw"):
            class_id = notes_db.save_notes_with_raw(notes_dict, raw_text=payload.raw_text)
        else:
            class_id = notes_db.save_notes(notes_dict)

        return JSONResponse(status_code=status.HTTP_201_CREATED, content={"class_id": class_id})

    except RuntimeError as e:
        # database-specific error
        raise HTTPException(status_code=500, detail=f"DB save failed: {e}")

    except Exception:
        # generic fallback without leaking internals
        raise HTTPException(status_code=500, detail="DB save failed due to an unexpected error.")

@app.get("/api/classes")
def get_classes():
    try:
        return notes_db.get_classes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/topics/{class_id}")
def get_topics(class_id: int):
    try:
        return notes_db.get_topics(class_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/notes/{topic_id}")
def get_notes(topic_id: int):
    try:
        return notes_db.get_notes(topic_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/class_hierarchy/{class_id}")
def get_class_hierarchy(class_id: int):
    try:
        return notes_db.get_class_hierarchy(class_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visualize", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
