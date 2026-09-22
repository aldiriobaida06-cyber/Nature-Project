from fastapi import FastAPI, File, UploadFile, Form, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import sqlite3
import uuid
import httpx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Only this folder (and its subfolders) is ever exposed over HTTP.
# main.py, database.db, and anything else in BASE_DIR sit outside it
# and are unreachable from the browser.
STATIC_DIR = os.path.join(BASE_DIR, "")
UPLOAD_DIR = os.path.join(STATIC_DIR, "static/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Keep the database file outside the static/ folder so it's never served.
DB_FILE = os.path.join(BASE_DIR, "database.db")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           username TEXT NOT NULL,
           text TEXT NOT NULL
    )
    """)
    conn.commit()
    conn.close()


init_db()


class UserMessage(BaseModel):
    username: str
    text: str


@app.get("/")
def read_index():
    html_file = os.path.join(STATIC_DIR, "static/27_index_all_concepts_CSS.html")
    if os.path.exists(html_file):
        return FileResponse(html_file)
    return {"error": f"Not found: {html_file}"}


@app.post("/api/send-message")
def receive_message(data: UserMessage):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO messages (username, text) VALUES (?, ?)", (data.username, data.text))
    conn.commit()
    conn.close()

    print(f"The message has been successfully saved to the database! {data.username}")
    return {"success": "success", "message": "The data has been successfully saved to the database!"}


@app.get("/api/get-messages")
def get_messages():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("SELECT username, text FROM messages ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()

    messages_list = [{"username": row[0], "text": row[1]} for row in rows]
    return messages_list


@app.post("/api/upload-wallpaper")
async def upload_wallpaper(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...)
):
    ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        return JSONResponse(
            status_code=400,
            content={"error": "Only JPG, PNG, or WEBP images are allowed."}
        )

    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid file extension."}
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        return JSONResponse(
            status_code=400,
            content={"error": "File is too large. Maximum size is 10MB."}
        )

    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    try:
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
    except Exception as e:
        print(f"Error saving file: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Could not save the file on the server."}
        )

    # UPLOAD_DIR is static/uploads, and static/ is mounted at /static below,
    # so this URL resolves correctly for the frontend.
    image_url = f"/static/uploads/{unique_filename}"

    return {
        "title": title,
        "description": description,
        "image_url": image_url
    }


# --- Unsplash proxy -----------------------------------------------------
# The access key lives only here, read from an environment variable.
# It is never sent to, or readable by, the browser.
UNSPLASH_ACCESS_KEY = "x1LHLKRr2IaRgjM_vYyMyufsxUrXs6nokQWeBcDDM8E"
UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"


@app.get("/api/photos")
async def search_photos(query: str = Query(..., min_length=1), per_page: int = 12):
    if not UNSPLASH_ACCESS_KEY:
        raise HTTPException(status_code=500, detail="Unsplash access key not configured on server.")

    params = {"query": query, "per_page": per_page}
    headers = {"Authorization": f"Client-ID {UNSPLASH_ACCESS_KEY}"}

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(UNSPLASH_SEARCH_URL, params=params, headers=headers, timeout=10)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail="Unsplash request failed.")
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Could not reach Unsplash.")

    return response.json()


# Mount ONLY the static/ subfolder, not BASE_DIR. database.db and main.py
# are outside static/ and are therefore never served over HTTP.
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory="static"), name="static")