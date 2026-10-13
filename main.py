"""Green Wings backend (FastAPI).

Environment variables:
    ADMIN_TOKEN          Secret for /admin, /api/get-messages and the upload moderation endpoints.
                         If it is not set, all admin functions are disabled.
    UNSPLASH_ACCESS_KEY  Your Unsplash API access key.

Dependencies:
    pip install fastapi "uvicorn[standard]" httpx pillow python-multipart
"""

import os
import re
import secrets
import sqlite3
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager, contextmanager
from io import BytesIO
from typing import Literal, Optional

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

# ---------------------------------------------------------------- paths / config

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")          # the ONLY folder exposed over HTTP
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")
THUMB_DIR = os.path.join(UPLOAD_DIR, "thumbs")
os.makedirs(THUMB_DIR, exist_ok=True)

DB_FILE = os.path.join(BASE_DIR, "database.db")        # outside static/, never served
INDEX_FILE = os.path.join(STATIC_DIR, "27_index_all_concepts_CSS.html")
ADMIN_FILE = os.path.join(STATIC_DIR, "admin.html")

ADMIN_TOKEN =("elG9wY4lesT8ho0r3fPvcN0tXikotKFqmZZPYiHAjhg")
UNSPLASH_ACCESS_KEY =("x1LHLKRr2IaRgjM_vYyMyufsxUrXs6nokQWeBcDDM8E")
UNSPLASH_API = "https://api.unsplash.com"

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
FORMAT_BY_EXT = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
MAX_FILE_SIZE = 10 * 1024 * 1024    # 10 MB
MAX_PIXELS = 50_000_000             # rejects decompression bombs (e.g. 8000 x 6000 = 48 MP is fine)
THUMB_WIDTH = 800

TARGET_RESULTS = 12                 # photos returned per "page" for the browser
UPSTREAM_PER_PAGE = 12
MAX_UPSTREAM_CALLS = 3              # max Unsplash requests per browser request
CACHE_TTL = 15 * 60                 # seconds
CACHE_MAX = 300                     # cached Unsplash pages

# ---------------------------------------------------------------- rate limiting


class RateLimit:
    """Tiny in-memory sliding-window limiter, one bucket per client IP.

    Behind a reverse proxy start uvicorn with `--proxy-headers --forwarded-allow-ips=<proxy ip>`
    so request.client.host is the visitor, not the proxy.
    """

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self.hits: dict = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        bucket = self.hits[ip]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        bucket.append(now)
        if len(self.hits) > 5000:   # keep memory bounded
            for key in [k for k, v in self.hits.items() if not v or now - v[-1] > self.window]:
                del self.hits[key]


message_limit = RateLimit(5, 600)
upload_limit = RateLimit(6, 3600)
search_limit = RateLimit(60, 60)
download_limit = RateLimit(60, 60)
admin_limit = RateLimit(30, 60)


def require_admin(x_admin_token: str = Header(default="")) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Admin access is disabled. Set the ADMIN_TOKEN environment variable.")
    if not secrets.compare_digest(x_admin_token.encode(), ADMIN_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Invalid admin token.")


ADMIN = [Depends(admin_limit), Depends(require_admin)]

# ---------------------------------------------------------------- database


@contextmanager
def db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def remove_files(*paths) -> None:
    for path in paths:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


def init_db() -> None:
    with db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")   # readers no longer block the writer
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               username TEXT NOT NULL,
               text TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS wallpapers (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               title TEXT NOT NULL,
               description TEXT NOT NULL DEFAULT '',
               image_url TEXT NOT NULL UNIQUE,
               thumb_url TEXT NOT NULL DEFAULT '',
               width INTEGER NOT NULL DEFAULT 0,
               height INTEGER NOT NULL DEFAULT 0,
               approved INTEGER NOT NULL DEFAULT 1
            )
        """)

        # Migrate databases created by the previous version. Old rows count as approved.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(wallpapers)")}
        for name, ddl in (
            ("thumb_url", "TEXT NOT NULL DEFAULT ''"),
            ("width", "INTEGER NOT NULL DEFAULT 0"),
            ("height", "INTEGER NOT NULL DEFAULT 0"),
            ("approved", "INTEGER NOT NULL DEFAULT 1"),
        ):
            if name not in columns:
                conn.execute(f"ALTER TABLE wallpapers ADD COLUMN {name} {ddl}")

        # Pick up files that exist on disk but not in the table (very old uploads).
        known = {row["image_url"] for row in conn.execute("SELECT image_url FROM wallpapers")}
        for name in sorted(os.listdir(UPLOAD_DIR), key=lambda n: os.path.getmtime(os.path.join(UPLOAD_DIR, n))):
            url = f"/static/uploads/{name}"
            path = os.path.join(UPLOAD_DIR, name)
            if os.path.isfile(path) and os.path.splitext(name)[1].lower() in FORMAT_BY_EXT and url not in known:
                conn.execute(
                    "INSERT INTO wallpapers (title, description, image_url, approved) VALUES (?, ?, ?, 1)",
                    ("Uploaded wallpaper", "", url),
                )

        # Create thumbnails + dimensions for uploads that don't have them yet (runs once per file).
        for row in conn.execute("SELECT id, image_url FROM wallpapers WHERE thumb_url = ''").fetchall():
            path = os.path.join(UPLOAD_DIR, os.path.basename(row["image_url"]))
            stem = os.path.splitext(os.path.basename(path))[0]
            try:
                img = load_image(path)
                save_thumbnail(img, os.path.join(THUMB_DIR, stem + ".webp"))
                conn.execute(
                    "UPDATE wallpapers SET thumb_url = ?, width = ?, height = ? WHERE id = ?",
                    (f"/static/uploads/thumbs/{stem}.webp", img.width, img.height, row["id"]),
                )
            except Exception as exc:
                print(f"Could not create a thumbnail for {path}: {exc}")


# ---------------------------------------------------------------- image processing (Pillow)


def load_image(source, expected_format: Optional[str] = None) -> Image.Image:
    """Open, validate, decode and auto-rotate an image. Metadata such as EXIF/GPS is not carried over."""
    img = Image.open(source)
    if expected_format and img.format != expected_format:
        raise ValueError("The file content does not match its extension.")
    if img.width * img.height > MAX_PIXELS:
        raise ValueError("The image dimensions are too large.")
    img.load()
    return ImageOps.exif_transpose(img)


def save_full(img: Image.Image, path: str, fmt: str) -> None:
    """Re-encode the original WITHOUT EXIF data (removes GPS location etc.), keeping the colour profile."""
    kwargs = {}
    if img.info.get("icc_profile"):
        kwargs["icc_profile"] = img.info["icc_profile"]
    if fmt == "JPEG":
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(path, "JPEG", quality=92, optimize=True, progressive=True, **kwargs)
    elif fmt == "PNG":
        img.save(path, "PNG", optimize=True, **kwargs)
    else:
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if ("A" in img.mode or "transparency" in img.info) else "RGB")
        img.save(path, "WEBP", quality=92, **kwargs)


def save_thumbnail(img: Image.Image, thumb_path: str) -> None:
    thumb = img
    if img.width > THUMB_WIDTH:
        thumb = img.resize(
            (THUMB_WIDTH, max(1, round(img.height * THUMB_WIDTH / img.width))),
            Image.Resampling.LANCZOS,
        )
    if thumb.mode not in ("RGB", "RGBA"):
        thumb = thumb.convert("RGB")
    thumb.save(thumb_path, "WEBP", quality=78, method=4)


def process_upload(contents: bytes, ext: str, title: str, description: str) -> dict:
    """Blocking work (Pillow + file + SQLite). Always called through run_in_threadpool()."""
    fmt = FORMAT_BY_EXT[ext]
    stem = uuid.uuid4().hex
    full_path = os.path.join(UPLOAD_DIR, stem + ext)
    thumb_path = os.path.join(THUMB_DIR, stem + ".webp")
    image_url = f"/static/uploads/{stem}{ext}"
    thumb_url = f"/static/uploads/thumbs/{stem}.webp"

    try:
        img = load_image(BytesIO(contents), fmt)
        save_full(img, full_path, fmt)
        save_thumbnail(img, thumb_path)
    except ValueError as exc:
        remove_files(full_path, thumb_path)
        raise HTTPException(status_code=400, detail=str(exc))
    except (OSError, Image.DecompressionBombError):
        remove_files(full_path, thumb_path)
        raise HTTPException(status_code=400, detail="That file could not be read as a valid image.")

    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO wallpapers (title, description, image_url, thumb_url, width, height, approved) "
                "VALUES (?, ?, ?, ?, ?, ?, 0)",
                (title, description, image_url, thumb_url, img.width, img.height),
            )
    except Exception:
        remove_files(full_path, thumb_path)
        raise HTTPException(status_code=500, detail="Could not save the wallpaper.")

    return {"title": title, "description": description, "status": "pending"}


# ---------------------------------------------------------------- Unsplash proxy

BANNED_KEYWORDS = [
    "car", "cars", "vehicle", "vehicles", "crypto", "bitcoin", "ethereum", "btc",
    "computer", "laptop", "bike", "motorcycle", "bicycle", "train", "plane", "airplane",
    "rtx", "gpu", "monitor", "screen", "gadget", "cartoon", "illustration", "vector", "logo",
    "gaming", "game", "man", "woman", "person", "people", "girl", "boy", "human", "fashion",
    "clothing", "shoes", "dress", "model", "house", "building", "city", "street",
    "desktop", "keyboard", "phone", "smartphone", "iphone", "technology", "anime", "manga",
    "interior", "room", "living room", "kitchen", "furniture", "office", "truck", "trucks",
    "jeep", "suv", "automobile",
]
BANNED_RE = re.compile(r"\b(?:" + "|".join(re.escape(k) for k in BANNED_KEYWORDS) + r")\b", re.I)
PHOTO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,32}$")

_cache: dict = {}   # (query, page, orientation) -> (timestamp, {"results": [...], "total_pages": n})


def is_allowed_photo(photo: dict) -> bool:
    tags = " ".join((t.get("title") or "") for t in (photo.get("tags") or []))
    text = f"{photo.get('description') or ''} {photo.get('alt_description') or ''} {tags}"
    return not BANNED_RE.search(text)


def slim_photo(photo: dict) -> dict:
    """Only the fields the browser needs: smaller responses, smaller cache."""
    urls = photo.get("urls") or {}
    user = photo.get("user") or {}
    return {
        "id": photo.get("id"),
        "description": photo.get("description") or photo.get("alt_description") or "",
        "width": photo.get("width"),
        "height": photo.get("height"),
        "color": photo.get("color"),
        "urls": {"raw": urls.get("raw"), "regular": urls.get("regular")},
        "user": {
            "name": user.get("name") or user.get("username") or "Unknown",
            "url": (user.get("links") or {}).get("html"),
        },
    }


async def fetch_unsplash_page(app: FastAPI, query: str, page: int, orientation: Optional[str]) -> dict:
    key = (query, page, orientation)
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]

    params = {"query": query, "page": page, "per_page": UPSTREAM_PER_PAGE, "content_filter": "high"}
    if orientation:
        params["orientation"] = orientation
    try:
        response = await app.state.http.get(f"{UNSPLASH_API}/search/photos", params=params)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=429, detail="The hourly Unsplash limit has been reached. Please try again later.")
        raise HTTPException(status_code=502, detail="Unsplash request failed.")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Unsplash.")

    raw = response.json()
    data = {
        "results": [slim_photo(p) for p in raw.get("results", []) if p.get("id") and is_allowed_photo(p)],
        "total_pages": int(raw.get("total_pages") or 0),
    }
    if len(_cache) >= CACHE_MAX:
        del _cache[min(_cache, key=lambda k: _cache[k][0])]   # drop the oldest entry
    _cache[key] = (now, data)
    return data


# ---------------------------------------------------------------- app


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_in_threadpool(init_db)
    app.state.http = httpx.AsyncClient(   # ONE shared client (connection pooling)
        timeout=10,
        headers={"Authorization": f"Client-ID {UNSPLASH_ACCESS_KEY}", "Accept-Version": "v1"},
    )
    yield
    await app.state.http.aclose()


class SelectiveGZip(GZipMiddleware):
    """gzip for text (HTML/CSS/JS/JSON) only. Images and fonts are already compressed."""

    SKIP = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".woff2", ".woff")

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].lower().endswith(self.SKIP):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


class CachedStaticFiles(StaticFiles):
    """Long cache for uploads and fonts (random file names / never change), 1 hour for the rest.
    There is no CORS middleware: the page and the API share one origin, so none is needed."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            long_lived = path.startswith(("uploads/", "fonts/"))
            response.headers["Cache-Control"] = (
                "public, max-age=31536000, immutable" if long_lived else "public, max-age=3600"
            )
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response


# /docs and /openapi.json are switched off so the admin endpoints aren't advertised.
app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SelectiveGZip, minimum_size=1000)


class UserMessage(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=1000)


# ---- pages

@app.get("/")
def read_index():
    if os.path.exists(INDEX_FILE):
        return FileResponse(INDEX_FILE, headers={"Cache-Control": "no-cache"})
    raise HTTPException(status_code=404, detail=f"Not found: {INDEX_FILE}")


@app.get("/admin")
def read_admin():
    if not os.path.exists(ADMIN_FILE):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(ADMIN_FILE, headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"})


# ---- visitor endpoints

@app.post("/api/send-message", dependencies=[Depends(message_limit)])
def receive_message(data: UserMessage):   # plain `def`: FastAPI runs it in a worker thread
    username, text = data.username.strip(), data.text.strip()
    if not username or not text:
        raise HTTPException(status_code=400, detail="Name and message must not be empty.")
    with db() as conn:
        conn.execute("INSERT INTO messages (username, text) VALUES (?, ?)", (username, text))
    return {"success": "success", "message": "The data has been successfully saved to the database!"}


@app.post("/api/upload-wallpaper", status_code=201, dependencies=[Depends(upload_limit)])
async def upload_wallpaper(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
):
    """New uploads are saved as 'pending' and only appear after approval in /admin."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, or WEBP images are allowed.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in FORMAT_BY_EXT:
        raise HTTPException(status_code=400, detail="Invalid file extension.")

    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File is too large. Maximum size is 10MB.")

    clean_title = title.strip()[:100] or "Untitled Wallpaper"
    clean_description = description.strip()[:300]
    # Pillow, disk and SQLite are blocking: keep them off the event loop.
    return await run_in_threadpool(process_upload, contents, ext, clean_title, clean_description)


@app.get("/api/wallpapers")
def list_wallpapers():
    """Approved uploads, newest first."""
    with db() as conn:
        rows = conn.execute(
            "SELECT title, description, image_url, thumb_url, width, height "
            "FROM wallpapers WHERE approved = 1 ORDER BY id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/photos", dependencies=[Depends(search_limit)])
async def search_photos(
    request: Request,
    query: str = Query(..., min_length=1, max_length=100),
    page: int = Query(1, ge=1, le=100),
    orientation: Optional[Literal["landscape", "portrait"]] = Query(None),
):
    """Filtered, de-duplicated, cached Unsplash results. `next_page` is null on the last page."""
    if not UNSPLASH_ACCESS_KEY:
        raise HTTPException(status_code=500, detail="Unsplash access key not configured on server.")

    search_query = f"{query.strip().lower()} nature landscape"
    results, seen = [], set()
    next_page, current = None, page

    for _ in range(MAX_UPSTREAM_CALLS):
        data = await fetch_unsplash_page(request.app, search_query, current, orientation)
        for photo in data["results"]:
            if photo["id"] not in seen:
                seen.add(photo["id"])
                results.append(photo)
        has_more = current < data["total_pages"]
        next_page = current + 1 if has_more else None
        if len(results) >= TARGET_RESULTS or not has_more:
            break
        current += 1

    return {"results": results, "next_page": next_page}


@app.post("/api/photos/{photo_id}/download", dependencies=[Depends(download_limit)])
async def track_download(request: Request, photo_id: str):
    """Unsplash API guidelines: report a download. Needs the API key, so it goes through the server."""
    if not PHOTO_ID_RE.match(photo_id) or not UNSPLASH_ACCESS_KEY:
        raise HTTPException(status_code=400, detail="Invalid request.")
    try:
        await request.app.state.http.get(f"{UNSPLASH_API}/photos/{photo_id}/download")
    except httpx.HTTPError:
        pass   # tracking must never break a download
    return Response(status_code=204)


# ---- admin endpoints (X-Admin-Token header required)

@app.get("/api/get-messages", dependencies=ADMIN)
def get_messages():
    with db() as conn:
        rows = conn.execute("SELECT id, username, text FROM messages ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


@app.delete("/api/messages/{message_id}", dependencies=ADMIN)
def delete_message(message_id: int):
    with db() as conn:
        conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
    return {"ok": True}


@app.get("/api/admin/wallpapers", dependencies=ADMIN)
def admin_list_wallpapers():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, title, description, image_url, thumb_url, approved "
            "FROM wallpapers ORDER BY approved ASC, id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/admin/wallpapers/{wallpaper_id}/approve", dependencies=ADMIN)
def approve_wallpaper(wallpaper_id: int):
    with db() as conn:
        updated = conn.execute("UPDATE wallpapers SET approved = 1 WHERE id = ?", (wallpaper_id,)).rowcount
    if not updated:
        raise HTTPException(status_code=404, detail="Wallpaper not found.")
    return {"ok": True}


@app.delete("/api/admin/wallpapers/{wallpaper_id}", dependencies=ADMIN)
def delete_wallpaper(wallpaper_id: int):
    with db() as conn:
        row = conn.execute("SELECT image_url, thumb_url FROM wallpapers WHERE id = ?", (wallpaper_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Wallpaper not found.")
        conn.execute("DELETE FROM wallpapers WHERE id = ?", (wallpaper_id,))
    remove_files(
        os.path.join(UPLOAD_DIR, os.path.basename(row["image_url"])),
        os.path.join(THUMB_DIR, os.path.basename(row["thumb_url"])) if row["thumb_url"] else None,
    )
    return {"ok": True}


# Mount ONLY static/. database.db and main.py live outside it and are never served.
app.mount("/static", CachedStaticFiles(directory=STATIC_DIR), name="static")