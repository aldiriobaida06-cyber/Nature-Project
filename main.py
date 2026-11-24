"""Green Wings backend (FastAPI).

Environment variables:
    ADMIN_TOKEN          Secret for /admin, /api/get-messages, the upload moderation endpoints and the backup endpoint.
                         If it is not set, all admin functions are disabled.
    UNSPLASH_ACCESS_KEY  Your Unsplash API access key.
    SUPABASE_URL         Project URL, e.g. https://<project-ref>.supabase.co
    SUPABASE_SECRET_KEY  The project's SECRET key (sb_secret_..., or the legacy service_role key). SERVER ONLY: it
                         bypasses Row Level Security, so it is never logged, never sent to a browser and must never
                         be committed. With both Supabase variables set, uploaded wallpapers are stored in the public
                         Storage bucket "wallpapers" and their metadata in the table "wallpapers" (run
                         supabase_setup.sql once). If either is missing, the app falls back to the old LOCAL mode
                         (SQLite table + static/uploads) so you can still test on your machine - but local files do
                         not survive on hosts with an ephemeral disk such as Render.
    TRUSTED_PROXIES      Comma-separated IPs / CIDR ranges of the reverse proxies whose X-Forwarded-For header
                         may be believed. Default: 127.0.0.1,::1. Set it to an empty value to never trust the
                         header. Wildcards ("*") are NOT supported on purpose.
    MAX_UPLOAD_MB        Hard limit for one uploaded image, in megabytes. Default: 15.
    BACKUP_DIR           Folder for database backups. Default: ./backups (next to main.py). It must NOT be inside
                         static/ (that folder is served over HTTP): such a path is refused.
    BACKUP_KEEP          How many backups to keep. Older ones are deleted after each new backup. Default: 14.

Dependencies:
    pip install fastapi "uvicorn[standard]" httpx pillow python-multipart python-dotenv supabase
    (Pillow >= 8.2 is needed: Image.open(..., formats=[...]) is used to restrict the decoders.)
    (The current supabase client needs Python 3.11 or newer.)
    For the tests:  pip install pytest   and then   pytest -q

Running behind a reverse proxy (nginx, Caddy, ...):
    Start uvicorn with `--no-proxy-headers`, so that exactly ONE layer (get_client_ip below) interprets
    X-Forwarded-For. Never use `--forwarded-allow-ips='*'`.

Database (SQLite) - what it still holds:
    Wallpapers live in Supabase when it is configured. The visitor MESSAGES (and, in local fallback mode, the
    wallpapers) stay in the local SQLite file. On a host with an ephemeral disk (Render without a persistent disk)
    that file is reset on every restart / redeploy.
    Every connection runs in WAL mode with synchronous=NORMAL and a 5 s busy timeout (see connect()).
    In WAL mode part of the data lives in database.db-wal / database.db-shm next to the database, so NEVER back
    it up with cp / rsync / a file-level snapshot of database.db alone. Use the built-in online backup instead
    (it uses SQLite's backup API, so it is safe while the site is running):

        python main.py backup [--dest DIR] [--keep N]     # for cron / systemd timers
        POST /api/admin/backup  (header X-Admin-Token)    # on demand, from a script or the admin page

    Example crontab entry (every night at 03:30):
        30 3 * * *  cd /path/to/greenwings && /path/to/venv/bin/python main.py backup

Moving wallpapers from the old local storage to Supabase (run once, on the machine that still has them):
        python main.py migrate-wallpapers
"""
import asyncio
import ipaddress
import json
import logging
import os
import random
import re
import secrets
import sqlite3
import sys
import threading
import time
import base64
import hashlib                                   # NEW
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone, timedelta
from io import BytesIO
from typing import Optional
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

try:                                    # colour-profile conversion (bundled with the normal Pillow wheels)
    from PIL import ImageCms
except ImportError:                     # pragma: no cover - profiles are then simply dropped
    ImageCms = None

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
print("\n" + "="*40)
if UNSPLASH_ACCESS_KEY and ADMIN_TOKEN:
    print("All keys and the database have been successfully identified!!!")
else:
    print("Check the variable names inside the .env file")
    print("="*40 + "\n")

logger = logging.getLogger("uvicorn.error")


def _env_int(name: str, default: int) -> int:
    """Positive integer from the environment; falls back to the default on anything invalid."""
    try:
        return max(1, int(os.getenv(name, default)))
    except ValueError:
        return default


# ---------------------------------------------------------------- paths / config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")          # the ONLY folder exposed over HTTP
FONTS_DIR = os.path.join(STATIC_DIR, "fonts")
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")
THUMB_DIR = os.path.join(UPLOAD_DIR, "thumbs")
os.makedirs(THUMB_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)
DB_FILE = os.path.join(BASE_DIR, "database.db")        # outside static/, never served
INDEX_FILE = os.path.join(STATIC_DIR, "27_index_all_concepts_CSS.html")
ADMIN_FILE = os.path.join( BASE_DIR,"templates", "admin.html")
if not UNSPLASH_ACCESS_KEY:
    print("WARNING: UNSPLASH_ACCESS_KEY is not set - /api/random and /api/photos will return 503.")
if not ADMIN_TOKEN:
    print("WARNING: ADMIN_TOKEN is not set - admin functions are disabled.")
if not os.path.isfile(os.path.join(FONTS_DIR, "plus-jakarta-sans-latin-wght-normal.woff2")):
    print("WARNING: static/fonts/plus-jakarta-sans-latin-wght-normal.woff2 is missing - the page will use a system font.")

UNSPLASH_API = "https://api.unsplash.com"

# --- SQLite
SQLITE_BUSY_TIMEOUT_MS = 5000       # how long a connection waits for a lock before "database is locked"

# --- backups (see "database backups" below)
BACKUP_DIR = os.path.abspath(os.getenv("BACKUP_DIR") or os.path.join(BASE_DIR, "backups"))   # never inside static/
BACKUP_KEEP = _env_int("BACKUP_KEEP", 14)
BACKUP_NAME_RE = re.compile(r"database-\d{8}-\d{6}-\d{6}\.db")     # only files with this name are ever pruned

# --- upload limits (see "image processing" below for how they are enforced)
UPLOAD_PATH = "/api/upload-wallpaper"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
FORMAT_BY_EXT = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
CONTENT_TYPE_BY_FORMAT = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}   # SUPABASE: our own, never the client's
ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")                  # the only decoders Pillow is allowed to try
MAX_UPLOAD_MB = _env_int("MAX_UPLOAD_MB", 15)
MAX_FILE_SIZE = MAX_UPLOAD_MB * 1024 * 1024                # strict per-file limit
MAX_UPLOAD_BODY = MAX_FILE_SIZE + 256 * 1024               # whole request: file + multipart framing + the text fields
MAX_PIXELS = 25_000_000           # decompression-bomb guard: 25 MP (e.g. 5000 x 5000). Bigger images are rejected.
MAX_EDGE = 16383                  # longest allowed side in pixels (also the WebP format limit)
MAX_ICC_BYTES = 512 * 1024        # larger embedded colour profiles are ignored, never parsed
MAX_CONCURRENT_UPLOAD_JOBS = 2    # decoding a big image needs ~100+ MB of RAM: never run more than this at once
UPLOAD_SLOT_WAIT = 10             # seconds an upload waits for a free slot before getting a 503
THUMB_WIDTH = 800
Image.MAX_IMAGE_PIXELS = MAX_PIXELS   # Pillow itself warns above this and raises DecompressionBombError above 2x

# --- blur-up placeholders (LQIP) ---
LQIP_SIZE = 24                      # longest edge of the placeholder in pixels (the browser blurs + stretches it)
LQIP_QUALITY = 30                   # WebP quality: at this size the file is only ~100-400 bytes

TARGET_RESULTS = 12                 # photos returned per "page" for the browser
HOME_QUERY = "nature wallpapers"    # see the note below the code
HOME_POOL_SIZE = 30                 # Unsplash's maximum per /photos/random call
HOME_POOL_TTL = 10 * 60             # seconds; shorter = more variety, more quota used
HOME_DEFAULT_SHOWN = 12
UPSTREAM_PER_PAGE = 12
MAX_UPSTREAM_CALLS = 3              # max Unsplash requests per browser request
MAX_PAGE = 100                      # deepest Unsplash search page a cursor may point at
CURSOR_VERSION = 1                  # bump it if the cursor payload ever changes shape
CACHE_TTL = 15 * 60                 # seconds
CACHE_MAX = 300                     # cached Unsplash pages
PHOTO_CACHE_MAX = 500               # cached single photos (shared ?photo=ID links)

# ---------------------------------------------------------------- Supabase (wallpaper metadata + image files)
#
# With SUPABASE_URL + SUPABASE_SECRET_KEY set:
#   * metadata  -> Postgres table  public.wallpapers   (created by supabase_setup.sql)
#   * the files -> PUBLIC Storage bucket "wallpapers"  (<name>.<ext> for the image, thumbs/<name>.webp for the thumbnail)
# so everything survives Render restarts and redeploys.
#
# Security model: the secret key bypasses Row Level Security, so it lives ONLY in this process. It is never logged,
# never put into a response and never given to the browser. The browser only ever sees the PUBLIC file URLs, which are
# built from SUPABASE_URL alone. Without the variables the app runs in the old local mode (SQLite + static/uploads).

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_SECRET_KEY = (os.getenv("SUPABASE_SECRET_KEY") or "").strip()
SUPABASE_BUCKET = "wallpapers"
SUPABASE_TABLE = "wallpapers"
SUPABASE_ORIGIN = ""                 # "https://<project-ref>.supabase.co": added to the CSP so the page may show the images
WALLPAPER_PUBLIC_COLUMNS = "title, description, image_url, thumb_url, lqip, width, height"
supabase_client = None

if SUPABASE_URL and SUPABASE_SECRET_KEY:
    _supabase_parts = urlparse(SUPABASE_URL)
    if _supabase_parts.scheme not in ("http", "https") or not _supabase_parts.netloc:
        raise RuntimeError("SUPABASE_URL must look like https://<project-ref>.supabase.co")
    try:
        from supabase import create_client
    except ImportError as exc:
        raise RuntimeError("SUPABASE_URL is set but the 'supabase' package is not installed (pip install supabase).") from exc
    # A wrong key is a deployment mistake: fail loudly here instead of silently falling back to a disk that Render wipes.
    supabase_client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    SUPABASE_ORIGIN = f"{_supabase_parts.scheme}://{_supabase_parts.netloc}"
    print(f"Wallpaper storage: Supabase (table '{SUPABASE_TABLE}', public bucket '{SUPABASE_BUCKET}').")
else:
    if SUPABASE_URL or SUPABASE_SECRET_KEY:
        print("WARNING: SUPABASE_URL and SUPABASE_SECRET_KEY must BOTH be set - Supabase is NOT used.")
    print("WARNING: Supabase is not configured - wallpapers use LOCAL storage (SQLite + static/uploads). "
          "That data is lost when the host's disk is reset (e.g. a Render restart).")
USE_SUPABASE = supabase_client is not None

# ---------------------------------------------------------------- security headers

_CSP_SUPABASE = f" {SUPABASE_ORIGIN}" if SUPABASE_ORIGIN else ""     # the uploaded images are served from Supabase Storage
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://images.unsplash.com" + _CSP_SUPABASE,    # data: = the blur-up placeholders
    "connect-src 'self' https://images.unsplash.com" + _CSP_SUPABASE,
    "worker-src 'self'",
    "manifest-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


def apply_security_headers(response: Response, path: str) -> Response:
    """Adds the security headers (never overrides a header a route already set)."""
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if path != "/admin":
        response.headers.setdefault("Content-Security-Policy", CSP)
    return response

# ---------------------------------------------------------------- client IP (trusted proxies)

MAX_FORWARDED_HOPS = 10     # only the last N entries of X-Forwarded-For are ever looked at


def _parse_ip(value: str):
    """IP address from a connection address or an X-Forwarded-For entry (tolerates a port suffix).
    Returns an ipaddress object, or None if the text is not an IP at all."""
    value = value.strip()
    if value.startswith("["):                       # [2001:db8::1]:443
        value = value[1:].split("]", 1)[0]
    elif value.count(":") == 1:                     # 203.0.113.7:51234
        value = value.split(":", 1)[0]
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:   # ::ffff:127.0.0.1 == 127.0.0.1
        ip = ip.ipv4_mapped
    return ip


def _load_trusted_proxies(raw: str) -> tuple:
    networks = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            networks.append(ipaddress.ip_network(item, strict=False))   # "10.0.0.5" -> /32, "172.18.0.0/16" works too
        except ValueError:
            print(f"WARNING: ignoring invalid TRUSTED_PROXIES entry {item!r} (use plain IPs or CIDR ranges).")
    return tuple(networks)


TRUSTED_PROXIES = _load_trusted_proxies(os.getenv("TRUSTED_PROXIES", "127.0.0.1,::1"))
print("Trusted proxies:", ", ".join(str(n) for n in TRUSTED_PROXIES) or "none (X-Forwarded-For is ignored)")


def _is_trusted_proxy(ip) -> bool:
    return any(ip in network for network in TRUSTED_PROXIES)


def get_client_ip(request: Request) -> str:
    """The address of the visitor, used for rate limiting and logging.

    * X-Forwarded-For is read ONLY when the TCP peer (request.client.host) is in TRUSTED_PROXIES.
      Anyone else can put anything into that header, so for them it is ignored completely.
    * Even then the list is read from the RIGHT: each trusted proxy appends the address it saw, so the
      right-most entries are the trustworthy ones and the left-most is whatever the visitor claimed.
      We skip our own proxies and stop at the first address that is not one of them.
    * Anything unparsable stops the walk and the last trustworthy address is returned.
    """
    peer = request.client.host if request.client else None
    if not peer:
        return "unknown"
    peer_ip = _parse_ip(peer)
    if peer_ip is None or not _is_trusted_proxy(peer_ip):
        return peer                                  # direct visitor: the header is attacker-controlled

    forwarded = request.headers.get("x-forwarded-for", "")
    if not forwarded:
        return peer

    client = peer
    for hop in reversed(forwarded.split(",")[-MAX_FORWARDED_HOPS:]):
        ip = _parse_ip(hop)
        if ip is None:
            break
        client = str(ip)
        if not _is_trusted_proxy(ip):
            break                                    # first address that is not our own proxy = the visitor
    return client

# ---------------------------------------------------------------- rate limiting


class RateLimit:
    """Tiny in-memory sliding-window limiter, one bucket per client IP.

    The IP comes from get_client_ip(): X-Forwarded-For is honoured only for the proxies in TRUSTED_PROXIES.
    """

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self.hits: dict = defaultdict(deque)

    def is_full(self, request: Request) -> bool:
        ip = get_client_ip(request)
        bucket = self.hits.get(ip)
        if not bucket:
            return False
        now = time.monotonic()
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        return len(bucket) >= self.limit

    def __call__(self, request: Request) -> None:
        ip = get_client_ip(request)
        now = time.monotonic()
        bucket = self.hits[ip]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            logger.warning("Rate limit hit ip=%s path=%s", ip, request.url.path)
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        bucket.append(now)
        if len(self.hits) > 5000:   # keep memory bounded
            for key in [k for k, v in self.hits.items() if not v or now - v[-1] > self.window]:
                del self.hits[key]


message_limit = RateLimit(5, 600)
upload_limit = RateLimit(6, 3600)
search_limit = RateLimit(60, 60)
download_limit = RateLimit(20, 3600)
photo_limit = RateLimit(20, 60)   # tighter: every unseen photo id costs one Unsplash call
admin_limit = RateLimit(300, 60)  # normal use: generous
fail_limit = RateLimit(10, 600)   # bad tokens: 10 per 10 min per IP
backup_limit = RateLimit(6, 3600)  # a backup reads the whole database: no hammering


def require_admin(request: Request, x_admin_token: str = Header(default="")) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(503, "Admin access is disabled. Set the ADMIN_TOKEN environment variable.")
    if fail_limit.is_full(request):
        raise HTTPException(429, "Too many failed attempts. Try again later.")
    if not secrets.compare_digest(x_admin_token.encode(), ADMIN_TOKEN.encode()):
        logger.warning("Invalid admin token ip=%s path=%s", get_client_ip(request), request.url.path)
        fail_limit(request)  # records one failure
        raise HTTPException(401, "Invalid admin token.")


ADMIN = [Depends(admin_limit), Depends(require_admin)]

# ---------------------------------------------------------------- database
#
# Every connection (requests, init_db, backups) is opened through connect(), which applies:
#   PRAGMA busy_timeout=5000      wait up to 5 s for a lock instead of failing at once with "database is locked"
#   PRAGMA journal_mode=WAL       readers no longer block the writer and the writer no longer blocks readers;
#                                 the mode is stored in the database file, repeating it is a cheap no-op
#   PRAGMA synchronous=NORMAL     the recommended pairing for WAL: still corruption-safe, far fewer fsyncs
#                                 (a power cut can lose the very last transactions, never corrupt the file)
# busy_timeout is set FIRST so that even the journal_mode switch of a brand-new database waits for locks.


def _configure_connection(conn: sqlite3.Connection) -> None:
    conn.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")


def connect(path: Optional[str] = None) -> sqlite3.Connection:
    """A configured connection to the application database (or to `path`). The caller must close it;
    most code should use the db() context manager below instead."""
    conn = sqlite3.connect(path or DB_FILE, timeout=SQLITE_BUSY_TIMEOUT_MS / 1000)
    conn.row_factory = sqlite3.Row
    try:
        _configure_connection(conn)
    except Exception:
        conn.close()
        raise
    return conn


@contextmanager
def db():
    conn = connect()
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


# ---------------------------------------------------------------- database backups
#
# Why not just copy database.db?  In WAL mode recent commits may still sit in database.db-wal, and a plain file
# copy made while a write is in progress can be torn or incomplete. SQLite's online backup API
# (Connection.backup) copies a consistent snapshot of the whole database while the site keeps running.
#
#   1. the snapshot is written to  database-<UTC timestamp>.db.tmp   (a half-written file never has a final name)
#   2. PRAGMA integrity_check must say "ok" for the copy, otherwise it is deleted and the backup FAILS
#   3. the copy is switched back to journal_mode=DELETE, so the backup is ONE self-contained file
#   4. os.replace() renames it to its final name (atomic on the same filesystem)
#   5. only the newest BACKUP_KEEP backups are kept (only files named database-YYYYmmdd-HHMMSS-ffffff.db are pruned)

_BACKUP_LOCK = threading.Lock()


class BackupInProgress(RuntimeError):
    """Another backup is already running."""


def _is_inside(path: str, folder: str) -> bool:
    path, folder = os.path.realpath(path), os.path.realpath(folder)
    try:
        return os.path.commonpath([path, folder]) == folder
    except ValueError:              # different drives on Windows
        return False


def _quiet_close(conn: Optional[sqlite3.Connection]) -> None:
    if conn is not None:
        try:
            conn.close()
        except sqlite3.Error:
            pass


def backup_database(dest_dir: Optional[str] = None, keep: Optional[int] = None) -> dict:
    """Creates one verified backup of the live database and prunes old ones.

    Safe to call while the site is serving requests. Blocking (disk + SQLite): from async code call it through
    run_in_threadpool (the endpoint below is a plain `def`, so FastAPI already does that).
    Returns {"file": name, "path": full path, "size": bytes, "removed": number of old backups deleted}.
    """
    target = os.path.abspath(dest_dir or BACKUP_DIR)
    keep = BACKUP_KEEP if keep is None else max(1, int(keep))
    if _is_inside(target, STATIC_DIR):
        raise ValueError("The backup folder must not be inside static/ (that folder is public).")
    if not os.path.isfile(DB_FILE):
        raise FileNotFoundError("The database file does not exist yet.")
    if not _BACKUP_LOCK.acquire(blocking=False):
        raise BackupInProgress("A backup is already running.")

    try:
        os.makedirs(target, mode=0o700, exist_ok=True)
        name = f"database-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.db"
        final_path = os.path.join(target, name)
        temp_path = final_path + ".tmp"
        source = destination = None
        try:
            source = connect()
            destination = sqlite3.connect(temp_path)
            source.backup(destination)                       # consistent snapshot of the whole database
            verdict = destination.execute("PRAGMA integrity_check").fetchone()[0]
            if verdict != "ok":
                raise RuntimeError(f"The backup failed its integrity check: {verdict}")
            destination.execute("PRAGMA journal_mode=DELETE")    # no -wal / -shm companions: one standalone file
            destination.close()
            destination = None
            try:
                os.chmod(temp_path, 0o600)                   # the database holds visitors' messages
            except OSError:
                pass
            os.replace(temp_path, final_path)
        except Exception:
            _quiet_close(destination)
            remove_files(temp_path, temp_path + "-wal", temp_path + "-shm", temp_path + "-journal")
            raise
        finally:
            _quiet_close(source)

        removed = 0
        for old in sorted(n for n in os.listdir(target) if BACKUP_NAME_RE.fullmatch(n))[:-keep]:
            remove_files(os.path.join(target, old))
            removed += 1
        return {"file": name, "path": final_path, "size": os.path.getsize(final_path), "removed": removed}
    finally:
        _BACKUP_LOCK.release()


def init_db() -> None:
    with db() as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        if str(mode).lower() != "wal":
            print(f"WARNING: SQLite could not enable WAL mode (journal_mode={mode}). "
                  "Network drives and some container volumes do not support it.")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               username TEXT NOT NULL,
               text TEXT NOT NULL
            )
        """)
        if USE_SUPABASE:
            return                      # SUPABASE: wallpapers live there, nothing else to prepare locally
        _init_local_wallpapers(conn)


def check_supabase() -> None:
    """Startup sanity check. Never raises: a missing table / bucket is reported loudly in the log instead, so the
    site still starts and the problem is easy to find (run supabase_setup.sql in the Supabase SQL Editor)."""
    try:
        supabase_client.table(SUPABASE_TABLE).select("id").limit(1).execute()
    except Exception as exc:
        logger.error("Supabase table '%s' is not reachable (%s: %s). Did you run supabase_setup.sql?",
                     SUPABASE_TABLE, type(exc).__name__, exc)
    try:
        supabase_client.storage.get_bucket(SUPABASE_BUCKET)
    except Exception as exc:
        logger.error("Supabase Storage bucket '%s' is not reachable (%s: %s). Did you run supabase_setup.sql?",
                     SUPABASE_BUCKET, type(exc).__name__, exc)


def _init_local_wallpapers(conn: sqlite3.Connection) -> None:
    """LOCAL FALLBACK MODE ONLY: the SQLite wallpapers table, its migrations and the thumbnail / placeholder backfills."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wallpapers (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           title TEXT NOT NULL,
           description TEXT NOT NULL DEFAULT '',
           image_url TEXT NOT NULL UNIQUE,
           thumb_url TEXT NOT NULL DEFAULT '',
           lqip TEXT NOT NULL DEFAULT '',
           width INTEGER NOT NULL DEFAULT 0,
           height INTEGER NOT NULL DEFAULT 0,
           approved INTEGER NOT NULL DEFAULT 1
        )
    """)

    # Migrate databases created by the previous version. Old rows count as approved.
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(wallpapers)")}
    for name, ddl in (

        ("thumb_url", "TEXT NOT NULL DEFAULT ''"),
        ("lqip", "TEXT NOT NULL DEFAULT ''"),          # NEW: base64 blur-up placeholder
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
                "INSERT INTO wallpapers (title,description,image_url, approved) VALUES (?, ?, ?,0) ",
                (name, "Imported orphaned file" , url)
            )

    # Create thumbnails + dimensions for uploads that don't have them yet (runs once per file).
    for row in conn.execute("SELECT id, image_url FROM wallpapers WHERE thumb_url = ''").fetchall():
        path = os.path.join(UPLOAD_DIR, os.path.basename(row["image_url"]))
        stem = os.path.splitext(os.path.basename(path))[0]
        try:
            img = sanitize_image(load_image(path))     # thumbnails never carry metadata, even for legacy files
            save_thumbnail(img, os.path.join(THUMB_DIR, stem + ".webp"))
            conn.execute(
                "UPDATE wallpapers SET thumb_url = ?, width = ?, height = ? WHERE id = ?",
                (f"/static/uploads/thumbs/{stem}.webp", img.width, img.height, row["id"]),
            )
        except Exception as exc:
            print(f"Could not create a thumbnail for {path}: {exc}")

    # NEW: quick backfill - give every row that has no blur-up placeholder yet one (runs once per row).
    backfill_lqip(conn)


# ---------------------------------------------------------------- image processing (Pillow)
#
# Upload pipeline (every step happens before anything is stored - on disk or in Supabase):
#   1. size      - the ASGI guard below + an exact size check reject oversized files before Pillow sees a byte
#   2. sniff     - Image.open(formats=JPEG/PNG/WEBP): the real format comes from the CONTENT, never the name
#   3. limits    - format, extension match and pixel count are checked from the header, BEFORE decoding
#   4. verify()  - Pillow's integrity check, then a reopen + full decode (verify() invalidates the first handle)
#   5. sanitise  - colour profile -> sRGB, mode -> RGB/RGBA, then the pixels are copied into a brand-new image
#                  object: EXIF/GPS, XMP, comments, text chunks, ICC blobs and trailing bytes cannot survive
#   6. encode    - full image, 800 px thumbnail and 24 px LQIP are ALL produced from that one clean image


class InvalidImage(ValueError):
    """A rejection whose message is safe to show to the visitor."""


_UPLOAD_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_UPLOAD_JOBS)


def _open_image(source) -> Image.Image:
    """Lazy open that only ever tries the JPEG, PNG and WebP decoders (no TIFF/PSD/EPS/... parsers)."""
    return Image.open(source, formats=list(ALLOWED_FORMATS))


def load_image(source, expected_format: Optional[str] = None) -> Image.Image:
    """Open, verify, decode and auto-rotate an image. `source` is a path or a binary file object.
    Raises InvalidImage (visitor-safe message) or whatever Pillow raises for corrupt data."""
    probe = _open_image(source)                          # reads the header only
    if probe.format not in ALLOWED_FORMATS:
        raise InvalidImage("Only JPG, PNG, or WEBP images are allowed.")
    if expected_format and probe.format != expected_format:
        raise InvalidImage("The file content does not match its extension.")
    width, height = probe.size
    if width < 1 or height < 1 or width * height > MAX_PIXELS or max(width, height) > MAX_EDGE:
        raise InvalidImage("The image dimensions are too large.")
    probe.verify()                                       # integrity check; the probe is unusable afterwards

    if hasattr(source, "seek"):
        source.seek(0)
    img = _open_image(source)
    img.load()                                           # the real decode: truncated / corrupt data fails here
    try:
        return ImageOps.exif_transpose(img)
    except Exception:                                    # unreadable EXIF must not reject a good picture
        return img


def _srgb_convert(img: Image.Image) -> Image.Image:
    """Converts pixels from an embedded ICC profile to sRGB so the colours stay right once the profile is
    dropped (phones shoot Display P3). Skipped for sRGB, oversized or broken profiles: those are never parsed."""
    icc = img.info.get("icc_profile")
    if (ImageCms is None or not isinstance(icc, (bytes, bytearray)) or not icc
            or len(icc) > MAX_ICC_BYTES or img.mode not in ("RGB", "RGBA", "L", "CMYK")):
        return img
    try:
        source = ImageCms.ImageCmsProfile(BytesIO(bytes(icc)))
        if "srgb" in (ImageCms.getProfileDescription(source) or "").lower():
            return img
        alpha = img.getchannel("A") if img.mode == "RGBA" else None
        base = img.convert("RGB") if alpha is not None else img
        out = ImageCms.profileToProfile(base, source, ImageCms.createProfile("sRGB"), outputMode="RGB")
        if out is None:
            return img
        if alpha is not None:
            out.putalpha(alpha)
        return out
    except Exception as exc:
        logger.info("Colour profile ignored (%s)", type(exc).__name__)
        return img


def _to_web_mode(img: Image.Image) -> Image.Image:
    has_alpha = img.mode in ("RGBA", "LA", "PA", "RGBa", "La") or "transparency" in img.info
    target = "RGBA" if has_alpha else "RGB"
    return img if img.mode == target else img.convert(target)


def sanitize_image(img: Image.Image) -> Image.Image:
    """Returns a pristine RGB/RGBA image holding ONLY the pixel values of `img`.
    The pixels are pasted into a new Image object, so nothing attached to the original (the .info dict with
    EXIF/GPS/XMP/comments/ICC, PNG text chunks, JPEG APPn segments, appended bytes) can ever reach an encoder."""
    img = _to_web_mode(_srgb_convert(img))
    clean = Image.new(img.mode, img.size)
    clean.paste(img)
    return clean


def save_full(img: Image.Image, target, fmt: str) -> None:
    """Re-encodes the clean image into a fresh file. `target` is a path or a binary file object (BytesIO, used for
    the Supabase upload). No exif=, xmp=, icc_profile= or comment= is ever passed, so the result contains the
    pixels and nothing else."""
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    if fmt == "JPEG":
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(target, "JPEG", quality=92, optimize=True, progressive=True)
    elif fmt == "PNG":
        img.save(target, "PNG", optimize=True)
    else:
        img.save(target, "WEBP", quality=92)


def save_thumbnail(img: Image.Image, thumb_target) -> Image.Image:
    """Writes the 800 px WebP thumbnail (to a path or a binary file object) and returns it
    (the placeholder is made from this small copy)."""
    thumb = img
    if img.width > THUMB_WIDTH:
        thumb = img.resize(
            (THUMB_WIDTH, max(1, round(img.height * THUMB_WIDTH / img.width))),
            Image.Resampling.LANCZOS,
        )
    if thumb.mode not in ("RGB", "RGBA"):
        thumb = thumb.convert("RGB")
    thumb.save(thumb_target, "WEBP", quality=78, method=4)
    return thumb


def make_lqip(img: Image.Image) -> str:
    """Tiny blur-up placeholder: a ~24 px WebP returned as a data URI (usually 100-400 bytes).
    The browser paints it instantly (CSS blurs and stretches it) until the real thumbnail has loaded.
    Needs no extra file and no extra request: it travels inside the /api/wallpapers JSON."""
    longest = max(img.width, img.height)
    small = img
    if longest > LQIP_SIZE:
        scale = LQIP_SIZE / longest
        small = img.resize(
            (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
            Image.Resampling.LANCZOS,
            reducing_gap=2.0,
        )
    if small.mode in ("RGBA", "LA", "PA") or "transparency" in small.info:
        rgba = small.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (128, 128, 128))     # transparent areas become neutral grey
        flat.paste(rgba, mask=rgba.getchannel("A"))
        small = flat
    elif small.mode != "RGB":
        small = small.convert("RGB")
    buffer = BytesIO()
    small.save(buffer, "WEBP", quality=LQIP_QUALITY, method=6)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def backfill_lqip(conn: sqlite3.Connection) -> None:
    """Creates the placeholder for every wallpaper row that has none (old uploads). Cheap: it reads the
    800 px thumbnail, not the full-size original. Rows whose files are gone are skipped (and retried next start)."""
    rows = conn.execute("SELECT id, image_url, thumb_url FROM wallpapers WHERE lqip = ''").fetchall()
    for row in rows:
        full_path = os.path.join(UPLOAD_DIR, os.path.basename(row["image_url"]))
        thumb_path = os.path.join(THUMB_DIR, os.path.basename(row["thumb_url"])) if row["thumb_url"] else ""
        try:
            if thumb_path and os.path.isfile(thumb_path):
                with Image.open(thumb_path) as source:
                    source.load()
                    lqip = make_lqip(source)
            else:
                lqip = make_lqip(load_image(full_path))
            conn.execute("UPDATE wallpapers SET lqip = ? WHERE id = ?", (lqip, row["id"]))
        except Exception as exc:
            print(f"Could not create a blur-up placeholder for {full_path}: {exc}")


def process_upload(stream, ext: str, title: str, description: str, client_ip: str = "unknown") -> dict:
    """Blocking work (Pillow + Supabase / files + SQLite). Always called through run_in_threadpool().
    `stream` is the already size-checked upload (a spooled temp file): it is decoded straight from there.

    Supabase mode: the re-encoded image and thumbnail are built in memory, uploaded to the public bucket, and the
    metadata row is inserted. If any step fails, whatever was already uploaded is removed again (no orphans).
    Local fallback mode: identical to the old behaviour (files in static/uploads + a SQLite row)."""
    fmt = FORMAT_BY_EXT[ext]
    stem = uuid.uuid4().hex
    full_path = os.path.join(UPLOAD_DIR, stem + ext)
    thumb_path = os.path.join(THUMB_DIR, stem + ".webp")
    image_url = f"/static/uploads/{stem}{ext}"
    thumb_url = f"/static/uploads/thumbs/{stem}.webp"
    full_target, thumb_target = full_path, thumb_path        # where the encoders write: files, or memory for Supabase
    full_key, thumb_key = f"{stem}{ext}", f"thumbs/{stem}.webp"
    if USE_SUPABASE:
        image_url, thumb_url = supabase_public_url(full_key), supabase_public_url(thumb_key)
        full_target, thumb_target = BytesIO(), BytesIO()

    if not _UPLOAD_SLOTS.acquire(timeout=UPLOAD_SLOT_WAIT):
        raise HTTPException(status_code=503, detail="The server is busy processing other uploads. Please try again shortly.")
    try:
        # 1) verify + decode + sanitise (a rejection here never touches the disk or Supabase)
        try:
            img = sanitize_image(load_image(stream, fmt))
        except InvalidImage as exc:
            logger.warning("Upload rejected ip=%s reason=%s", client_ip, exc)
            raise HTTPException(status_code=400, detail=str(exc))
        except Image.DecompressionBombError:
            logger.warning("Upload rejected ip=%s reason=decompression-bomb", client_ip)
            raise HTTPException(status_code=400, detail="The image dimensions are too large.")
        except Exception as exc:    # Pillow raises OSError, SyntaxError, EOFError, ValueError, ... for bad data
            logger.warning("Upload rejected ip=%s reason=not-a-valid-image (%s)", client_ip, type(exc).__name__)
            raise HTTPException(status_code=400, detail="That file could not be read as a valid image.")

        # 2) one clean image -> full re-encode + 800 px thumbnail + 24 px LQIP
        try:
            save_full(img, full_target, fmt)
            thumb = save_thumbnail(img, thumb_target)
        except Exception:
            remove_files(full_path, thumb_path)
            logger.exception("Could not write the re-encoded upload (ip=%s)", client_ip)
            raise HTTPException(status_code=500, detail="Could not save the wallpaper.")
    finally:
        _UPLOAD_SLOTS.release()

    # The placeholder is a bonus. If it ever fails, the upload still succeeds (backfill_lqip retries on restart).
    try:
        lqip = make_lqip(thumb)
    except Exception as exc:
        logger.warning("Could not create a blur-up placeholder: %s", exc)
        lqip = ""

    if USE_SUPABASE:
        try:
            sb_upload(full_key, full_target.getvalue(), CONTENT_TYPE_BY_FORMAT[fmt])
            sb_upload(thumb_key, thumb_target.getvalue(), "image/webp")
            sb_insert_wallpaper({
                "title": title, "description": description,
                "image_url": image_url, "thumb_url": thumb_url, "lqip": lqip,
                "width": img.width, "height": img.height, "approved": 0,        # pending until approved in /admin
            })
        except Exception:
            sb_remove(full_key, thumb_key)                   # no orphaned files if the upload or the insert failed
            logger.exception("Could not store the upload in Supabase (ip=%s)", client_ip)
            raise HTTPException(status_code=500, detail="Could not save the wallpaper.")
    else:
        try:
            with db() as conn:
                conn.execute(
                    "INSERT INTO wallpapers (title, description, image_url, thumb_url, lqip, width, height, approved) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
                    (title, description, image_url, thumb_url, lqip, img.width, img.height),
                )
        except Exception:
            remove_files(full_path, thumb_path)
            logger.exception("Could not store the upload in the database (ip=%s)", client_ip)
            raise HTTPException(status_code=500, detail="Could not save the wallpaper.")

    logger.info("Upload accepted ip=%s file=%s %dx%d", client_ip, stem + ext, img.width, img.height)
    return {"title": title, "description": description, "status": "pending"}


# ---------------------------------------------------------------- Supabase wallpaper store
#
# Thin helpers around the supabase client. They are blocking (HTTP), so they only run inside plain `def` endpoints
# or run_in_threadpool(). Every query goes through the client's parameter handling, nothing is built from user text.
# The functions below are only called when USE_SUPABASE is true.

SB_PAGE = 1000          # PostgREST returns at most 1000 rows per request
SB_MAX_ROWS = 20_000    # safety cap for the wallpaper-of-the-day scan


def supabase_public_url(key: str) -> str:
    """Public URL of an object in the bucket. Built from SUPABASE_URL alone: the secret key is never involved."""
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{key}"


def _key_from_public_url(url: Optional[str]) -> Optional[str]:
    """Bucket key of a stored public URL, or None for anything that is not one of ours."""
    prefix = supabase_public_url("")
    if not url or not url.startswith(prefix):
        return None
    key = url[len(prefix):]
    return key if key and ".." not in key.split("/") else None


def sb_upload(key: str, data: bytes, content_type: str, upsert: bool = False) -> None:
    supabase_client.storage.from_(SUPABASE_BUCKET).upload(
        path=key,
        file=data,
        file_options={
            "content-type": content_type,
            "cache-control": "31536000",                 # names are unique (uuid) and never change: cache for a year
            "upsert": "true" if upsert else "false",     # the client wants strings here
        },
    )


def sb_remove(*keys: Optional[str]) -> None:
    """Best-effort delete of files in the bucket (missing files are not an error)."""
    keys = [k for k in keys if k]
    if not keys:
        return
    try:
        supabase_client.storage.from_(SUPABASE_BUCKET).remove(keys)
    except Exception as exc:
        logger.warning("Could not remove %d file(s) from Supabase Storage (%s)", len(keys), type(exc).__name__)


def sb_insert_wallpaper(row: dict) -> None:
    supabase_client.table(SUPABASE_TABLE).insert(row).execute()


def sb_list_wallpapers() -> list:
    """Approved uploads, newest first (same rows and fields as the old SQLite query)."""
    result = (
        supabase_client.table(SUPABASE_TABLE)
        .select(WALLPAPER_PUBLIC_COLUMNS)
        .eq("approved", 1)
        .order("id", desc=True)
        .limit(100)
        .execute()
    )
    return result.data or []


def sb_admin_list_wallpapers() -> list:
    """Pending first, then approved, newest first inside each group (same order as the old SQLite query)."""
    result = (
        supabase_client.table(SUPABASE_TABLE)
        .select("id, title, description, image_url, thumb_url, approved")
        .order("approved", desc=False)
        .order("id", desc=True)
        .limit(100)
        .execute()
    )
    return result.data or []


def sb_approve_wallpaper(wallpaper_id: int) -> bool:
    result = supabase_client.table(SUPABASE_TABLE).update({"approved": 1}).eq("id", wallpaper_id).execute()
    return bool(result.data)


def sb_delete_wallpaper(wallpaper_id: int) -> bool:
    """Deletes the row first, then its two files. Returns False when the id does not exist."""
    found = (
        supabase_client.table(SUPABASE_TABLE)
        .select("image_url, thumb_url")
        .eq("id", wallpaper_id)
        .limit(1)
        .execute()
        .data
    )
    if not found:
        return False
    supabase_client.table(SUPABASE_TABLE).delete().eq("id", wallpaper_id).execute()
    sb_remove(_key_from_public_url(found[0].get("image_url")), _key_from_public_url(found[0].get("thumb_url")))
    return True


def sb_pick_upload_for_day(day: str) -> Optional[dict]:
    """Same rule as the SQLite version: approved uploads ordered by id, landscape ones first, picked by the date.
    PostgREST cannot compare two columns (width >= height), so the small id/width/height list is filtered here."""
    n = _day_number(day)
    rows: list = []
    start = 0
    while len(rows) < SB_MAX_ROWS:
        page = (
            supabase_client.table(SUPABASE_TABLE)
            .select("id, width, height")
            .eq("approved", 1)
            .order("id")
            .range(start, start + SB_PAGE - 1)
            .execute()
            .data
        ) or []
        rows.extend(page)
        if len(page) < SB_PAGE:
            break
        start += SB_PAGE
    pool = [r["id"] for r in rows if r["width"] == 0 or r["width"] >= r["height"]] or [r["id"] for r in rows]
    if not pool:
        return None
    chosen = pool[n % len(pool)]
    picked = (
        supabase_client.table(SUPABASE_TABLE)
        .select(WALLPAPER_PUBLIC_COLUMNS)
        .eq("id", chosen)
        .limit(1)
        .execute()
        .data
    )
    return picked[0] if picked else None


# ---------------------------------------------------------------- Unsplash proxy

# Photo-level filter: only clearly off-topic subjects, checked against description + alt text ONLY (not tags).
# People/buildings/etc. are deliberately NOT here. Tune this list to taste.
PHOTO_BANNED_KEYWORDS = [
    "car", "cars", "truck", "trucks", "suv", "jeep", "automobile", "vehicle", "vehicles",
    "motorcycle", "laptop", "computer", "keyboard", "smartphone", "iphone", "gpu", "rtx",
    "crypto", "bitcoin", "ethereum", "anime", "manga", "cartoon", "illustration", "vector", "logo",
    "fashion", "furniture", "interior", "living room", "kitchen", "office",
]
PHOTO_BANNED_RE = re.compile(r"\b(?:" + "|".join(re.escape(k) for k in PHOTO_BANNED_KEYWORDS) + r")\b", re.I)

# Unsplash search is English-only, so common Arabic nature words are mapped to English keywords.
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
_AR_MARKS = re.compile(r"[\u0640\u064B-\u065F\u0670]")        # tatweel + diacritics


def _ar_norm(word: str) -> str:
    word = _AR_MARKS.sub("", word)
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ة", "ه")):
        word = word.replace(a, b)
    return word


_AR_TO_EN_RAW = {
    "غابة": "forest", "غابات": "forest", "شجرة": "tree", "أشجار": "trees", "اشجار": "trees",
    "جبل": "mountain", "جبال": "mountains", "قمة": "peak", "وادي": "valley", "تلال": "hills",
    "بحر": "sea", "محيط": "ocean", "محيطات": "ocean", "شاطئ": "beach", "موج": "waves", "أمواج": "waves",
    "بحيرة": "lake", "نهر": "river", "شلال": "waterfall", "جزيرة": "island",
    "غروب": "sunset", "شروق": "sunrise", "سماء": "sky", "غيوم": "clouds", "نجوم": "stars",
    "قمر": "moon", "ثلج": "snow", "مطر": "rain", "ضباب": "fog", "صحراء": "desert", "كثبان": "dunes",
    "زهور": "flowers", "زهرة": "flower", "ورد": "flowers", "طبيعة": "nature",
    "خريف": "autumn", "شتاء": "winter", "ربيع": "spring", "صيف": "summer",
}
AR_TO_EN = {_ar_norm(k): v for k, v in _AR_TO_EN_RAW.items()}


def to_english_query(q: str) -> str:
    """Collapses whitespace and translates known Arabic words. Unknown Arabic words are dropped."""
    out = []
    for word in q.split():
        if not ARABIC_RE.search(word):
            out.append(word)                                   # Latin / accented words pass through
            continue
        n = _ar_norm(word)
        base = n[2:] if n.startswith("ال") and len(n) > 3 else n   # strip the "the" prefix
        hit = AR_TO_EN.get(n) or AR_TO_EN.get(base)
        if hit:
            out.append(hit)
    return " ".join(out)


BANNED_RE = re.compile(r"\b(?:" + "|".join(re.escape(k) for k in PHOTO_BANNED_KEYWORDS) + r")\b", re.I)
PHOTO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,32}$")
# BlurHash strings use a base-83 alphabet. Anything else is dropped before it can reach the browser.
BLUR_HASH_RE = re.compile(r"^[0-9A-Za-z#$%*+,\-.:;=?@\[\]^_{|}~]{6,100}$")

_cache: dict = {}   # (query, page, orientation) -> (timestamp, {"results": [...], "total_pages": n})
_photo_cache: dict = {}   # photo id -> (expires, slim_photo | None); used by /api/photos/{photo_id}


VALID_ORIENTATIONS = {"landscape", "portrait", "squarish"}


def normalize_orientation(value: Optional[str]) -> Optional[str]:
    """Any string is accepted. Returns a valid Unsplash orientation, or None for
    'no filter' ('', 'all', 'any', unknown values). Never raises a 422."""
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if value in VALID_ORIENTATIONS else None


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---- cursor pagination
# Unsplash itself only understands page numbers, so the cursor is an opaque token that wraps the upstream
# position AND the search it belongs to. The browser never builds or reads one: it just sends back the
# `next_cursor` it was given. A cursor from another query / orientation, or a hand-made one, is rejected (400).


def encode_cursor(page: int, query: str, orientation: Optional[str]) -> str:
    payload = json.dumps({"v": CURSOR_VERSION, "p": page, "q": query, "o": orientation}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")


def decode_cursor(cursor: str, query: str, orientation: Optional[str]) -> int:
    """Returns the upstream page the cursor points at, or raises a clean 400."""
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
        page = data["p"]
        valid = (
            data.get("v") == CURSOR_VERSION
            and isinstance(page, int)
            and not isinstance(page, bool)
            and 1 <= page <= MAX_PAGE
            and data.get("q") == query
            and data.get("o") == orientation
        )
    except (ValueError, KeyError, TypeError, AttributeError):   # bad base64 / JSON / shape (all ValueError or TypeError)
        valid = False
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid cursor.")
    return page


def _query_tokens(query: str) -> list:
    out = []
    for w in re.findall(r"[a-z0-9]+", query.lower()):
        if len(w) >= 3:
            out.append(w[:-1] if w.endswith("s") and len(w) > 3 else w)   # crude plural handling
    return out


def _photo_text(photo: dict) -> str:
    tags = photo.get("tags")
    tag_text = " ".join(t.get("title", "") for t in tags if isinstance(t, dict)) if isinstance(tags, list) else ""
    return f"{photo.get('description') or ''} {photo.get('alt_description') or ''} {tag_text}".lower()


def is_allowed_photo(photo) -> bool:
    """True only for a usable photo dict that passes the keyword filter."""
    if not isinstance(photo, dict) or not photo.get("id"):
        return False
    urls = photo.get("urls")
    if not isinstance(urls, dict) or not (urls.get("regular") or urls.get("raw")):
        return False
    text = f"{photo.get('description') or ''} {photo.get('alt_description') or ''}"
    return not PHOTO_BANNED_RE.search(text)


def slim_photo(photo: dict) -> dict:
    """Only the fields the browser needs. Call it after is_allowed_photo()."""
    urls = photo.get("urls") if isinstance(photo.get("urls"), dict) else {}
    user = photo.get("user") if isinstance(photo.get("user"), dict) else {}
    user_links = user.get("links") if isinstance(user.get("links"), dict) else {}
    blur_hash = photo.get("blur_hash")
    return {
        "id": photo.get("id"),
        "description": photo.get("description") or photo.get("alt_description") or "",
        "width": photo.get("width"),
        "height": photo.get("height"),
        "color": photo.get("color"),
        # NEW: Unsplash's own compact placeholder; script.js turns it into the blur-up image (no extra request).
        "blur_hash": blur_hash if isinstance(blur_hash, str) and BLUR_HASH_RE.fullmatch(blur_hash) else None,
        "urls": {"raw": urls.get("raw"), "regular": urls.get("regular")},
        "user": {
            "name": user.get("name") or user.get("username") or "Unknown",
            "url": user_links.get("html"),
        },
    }


def _upstream_error(exc: Exception) -> HTTPException:
    """Map an httpx failure to a clean HTTP error (never a 500)."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code in (403, 429):
            return HTTPException(status_code=429, detail="The hourly Unsplash limit has been reached. Please try again later.")
        if code == 401:
            return HTTPException(status_code=502, detail="Unsplash rejected the access key.")
        return HTTPException(status_code=502, detail="Unsplash request failed.")
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(status_code=504, detail="Unsplash timed out.")
    return HTTPException(status_code=502, detail="Could not reach Unsplash.")


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
        raw = response.json()
    except httpx.HTTPError as exc:
        raise _upstream_error(exc)
    except ValueError:
        raise HTTPException(status_code=502, detail="Unsplash returned invalid data.")

    if not isinstance(raw, dict):
        raise HTTPException(status_code=502, detail="Unsplash returned an unexpected response.")
    items = raw.get("results")
    if not isinstance(items, list):
        items = []

    tokens = _query_tokens(query)
    texts = [_photo_text(p) for p in items if isinstance(p, dict)]
    any_match = (
        not tokens
        or not any(texts)   # no photo has any text, so we can't judge: don't block
        or any(txt and any(tok in txt for tok in tokens) for txt in texts)
    )

    data = {
        "results": [slim_photo(p) for p in items if is_allowed_photo(p)],
        "total_pages": _as_int(raw.get("total_pages")),
        "total": _as_int(raw.get("total")),
        "any_match": any_match,
    }
    if len(_cache) >= CACHE_MAX:
        _cache.pop(next(iter(_cache)))  # evict oldest
    _cache[key] = (now, data)
    return data


_home_pool: dict = {}   # orientation -> (timestamp, [slim photos])


async def get_home_pool(app: FastAPI, orientation: Optional[str]) -> list:
    """Cached pool of random photos. Always returns a list; raises only a clean
    HTTPException when there is no data at all and Unsplash is failing."""
    orientation = normalize_orientation(orientation)
    key = orientation or "any"
    hit = _home_pool.get(key)
    if hit and time.time() - hit[0] < HOME_POOL_TTL:
        return hit[1]

    async with app.state.home_lock:
        hit = _home_pool.get(key)
        if hit and time.time() - hit[0] < HOME_POOL_TTL:
            return hit[1]

        params = {"count": HOME_POOL_SIZE, "query": HOME_QUERY, "content_filter": "high"}
        if orientation:
            params["orientation"] = orientation
        try:
            response = await app.state.http.get(f"{UNSPLASH_API}/photos/random", params=params)
            response.raise_for_status()
            raw = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            if hit:                      # serve the stale pool rather than an error
                return hit[1]
            if isinstance(exc, ValueError):
                raise HTTPException(status_code=502, detail="Unsplash returned invalid data.")
            raise _upstream_error(exc)

        # With `count`, Unsplash returns a list; without it, a single dict.
        if isinstance(raw, dict):
            raw = [raw]
        if not isinstance(raw, list):
            raw = []

        seen = set()
        photos = []
        for p in raw:
            if is_allowed_photo(p) and p["id"] not in seen:
                seen.add(p["id"])
                photos.append(slim_photo(p))
        if photos:
            _home_pool[key] = (time.time(), photos)
            return photos
        return hit[1] if hit else []

# ---------------------------------------------------------------- app


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_in_threadpool(init_db)
    if USE_SUPABASE:
        await run_in_threadpool(check_supabase)
    app.state.home_lock = asyncio.Lock()
    app.state.http = httpx.AsyncClient(  # ONE shared client (connection pooling)
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
    """Long cache for files whose names never change (uploads, fonts), 1 hour for the rest.
    There is no CORS middleware: the page and the API share one origin, so none is needed."""

    def __init__(self, *args, long_lived_prefixes: tuple = (), **kwargs):
        super().__init__(*args, **kwargs)
        self.long_lived_prefixes = long_lived_prefixes

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            long_lived = path.replace(os.sep, "/").startswith(self.long_lived_prefixes)
            response.headers["Cache-Control"] = (
                "public, max-age=31536000, immutable" if long_lived else "public, max-age=3600"
            )
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response


class _BodyTooLarge(Exception):
    pass


class UploadSizeLimitMiddleware:
    """Pure-ASGI guard for the upload route. It runs BEFORE FastAPI parses the multipart body (which would
    otherwise spool the whole file to disk first):

      * a Content-Length above the limit is answered with 413 immediately, without reading the body;
      * a body without / with a false Content-Length is counted while it streams in and cut off at the limit.

    Whatever the route does after the cut-off (FastAPI turns a failed body read into a 400), the visitor
    always receives the same clean 413. Rejected responses still get the normal security headers."""

    def __init__(self, app, path: str, max_body: int):
        self.app = app
        self.path = path
        self.max_body = max_body

    async def _reject(self, scope, receive, send) -> None:
        logger.warning("Upload rejected ip=%s reason=body-too-large", get_client_ip(Request(scope)))
        response = JSONResponse(
            {"detail": f"File is too large. Maximum size is {MAX_UPLOAD_MB}MB."},
            status_code=413,
            headers={"Connection": "close"},
        )
        apply_security_headers(response, scope["path"])
        await response(scope, receive, send)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != self.path:
            await self.app(scope, receive, send)
            return

        for name, value in scope["headers"]:
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    break
                if declared > self.max_body:
                    await self._reject(scope, receive, send)
                    return
                break

        received = 0
        too_large = False
        started = False          # a response (the app's, or our 413) has been sent

        async def limited_receive():
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body:
                    too_large = True
                    raise _BodyTooLarge()
            return message

        async def guarded_send(message):
            nonlocal started
            if too_large:                       # replace whatever the app tries to answer with our 413
                if not started:
                    started = True
                    await self._reject(scope, receive, send)
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not too_large:
                raise
            if not started:
                started = True
                await self._reject(scope, receive, send)


# /docs and /openapi.json are switched off so the admin endpoints aren't advertised.
app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SelectiveGZip, minimum_size=1000)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    return apply_security_headers(response, request.url.path)


# Added last = outermost: oversized uploads are stopped before anything else looks at the body.
app.add_middleware(UploadSizeLimitMiddleware, path=UPLOAD_PATH, max_body=MAX_UPLOAD_BODY)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    """Generic 500: the real error (and any file path) goes to the server log only.
    This handler runs outside the middleware above, so it adds the security headers itself."""
    logger.error("Unhandled error on %s %s (ip=%s)", request.method, request.url.path, get_client_ip(request), exc_info=exc)
    response = JSONResponse({"detail": "Internal Server Error"}, status_code=500)
    return apply_security_headers(response, request.url.path)


class UserMessage(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=1000)


def serve(name: str, mime: str, cache: str = "public, max-age=3600") -> FileResponse:
    path = os.path.join(STATIC_DIR, name)
    if not os.path.isfile(path):
        logger.error("Missing file: %s", path)
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type=mime, headers={"Cache-Control": cache})


# ---- pages (explicit routes keep these files at their short URLs)

@app.get("/", include_in_schema=False)
async def index():
    # Also serves shared links such as /?photo=ID and /?q=forest: the page reads the query string itself.
    return serve("27_index_all_concepts_CSS.html", "text/html", "no-cache")


@app.get("/sw.js", include_in_schema=False)
async def sw():
    return serve("sw.js", "text/javascript", "no-cache")


@app.get("/manifest.webmanifest", include_in_schema=False)
async def manifest():
    return serve("manifest.webmanifest", "application/manifest+json", "public, max-age=86400")


@app.get("/style_23.css", include_in_schema=False)
async def css():
    return serve("style_23.css", "text/css")


@app.get("/theme-init.js", include_in_schema=False)
async def theme():
    return serve("theme-init.js", "text/javascript")


@app.get("/admin")
def read_admin():
    if not os.path.exists(ADMIN_FILE):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(ADMIN_FILE, headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"})


# Mount ONLY static/ (and its fonts/ folder). database.db and main.py live outside it and are never served.
app.mount("/fonts", CachedStaticFiles(directory=FONTS_DIR, long_lived_prefixes=("",)), name="fonts")
app.mount("/static", CachedStaticFiles(directory=STATIC_DIR, long_lived_prefixes=("uploads/", "fonts/")), name="static")


# ---- visitor endpoints

@app.post("/api/send-message", dependencies=[Depends(message_limit)])
def receive_message(data: UserMessage):  # plain `def`: FastAPI runs it in a worker thread
    username, text = data.username.strip(), data.text.strip()
    if not username or not text:
        raise HTTPException(status_code=400, detail="Name and message must not be empty.")
    with db() as conn:
        conn.execute("INSERT INTO messages (username, text) VALUES (?, ?)", (username, text))
    return {"success": "success", "message": "The data has been successfully saved to the database!"}


def _stream_size(stream) -> int:
    """Exact size of a seekable upload without reading it into memory."""
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    return size


@app.post(UPLOAD_PATH, status_code=201, dependencies=[Depends(upload_limit)])
async def upload_wallpaper(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
):
    """New uploads are saved as 'pending' and only appear after approval in /admin.
    The file is size-checked, verified, fully re-encoded (all metadata stripped) and only then stored
    (Supabase Storage + table when configured, otherwise static/uploads + SQLite)."""
    client_ip = get_client_ip(request)

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        logger.warning("Upload rejected ip=%s reason=content-type %r", client_ip, file.content_type)
        raise HTTPException(status_code=400, detail="Only JPG, PNG, or WEBP images are allowed.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in FORMAT_BY_EXT:
        logger.warning("Upload rejected ip=%s reason=extension %r", client_ip, ext[:10])
        raise HTTPException(status_code=400, detail="Invalid file extension.")

    # Size gate BEFORE any image decoding: the body is already on a spooled temp file, so this reads nothing.
    size = getattr(file, "size", None)
    if size is None:
        size = _stream_size(file.file)
    if size > MAX_FILE_SIZE:
        logger.warning("Upload rejected ip=%s reason=too-large (%d bytes)", client_ip, size)
        raise HTTPException(status_code=413, detail=f"File is too large. Maximum size is {MAX_UPLOAD_MB}MB.")
    if size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    clean_title = title.strip()[:100] or "Untitled Wallpaper"
    clean_description = description.strip()[:300]
    # Pillow, Supabase, disk and SQLite are blocking: keep them off the event loop.
    return await run_in_threadpool(process_upload, file.file, ext, clean_title, clean_description, client_ip)


@app.get("/api/wallpapers")
def get_wallpapers():
    """Approved uploads, newest first (each with its tiny blur-up placeholder)."""
    if USE_SUPABASE:
        return sb_list_wallpapers()
    with db() as conn:
        rows = conn.execute(
            "SELECT title, description, image_url, thumb_url, lqip, width, height "
            "FROM wallpapers WHERE approved = 1 ORDER BY id DESC LIMIT 100"
        ).fetchall()
    return [dict(r) for r in rows]

# ---- Wallpaper of the Day
#
# One featured wallpaper per UTC calendar day: no cron job, no extra table.
#   * The pick is a pure function of the "YYYY-MM-DD" string (SHA-256, never hash(): Python randomises str hashes
#     per process), so every worker and every restart agrees on it.
#   * The result is kept in memory under that date string, so the 2nd..Nth request of the day never touches the
#     database. Only today's entry is kept, so memory stays O(1) forever.
#   * Source order: approved uploads first (landscape preferred, the banner is wide); if there are none, a curated
#     Unsplash search (fetch_unsplash_page already caches it and applies the keyword filter).
#   * The response has the same shape as the feed: an /api/wallpapers row for uploads, a slim_photo() dict for
#     Unsplash, plus "source" and "date". script.js feeds it to uploadMeta() / normalizeItem().

WOTD_FALLBACK_QUERIES = (
    "mountain landscape", "forest sunlight", "ocean waves", "waterfall",
    "misty forest", "alpine lake", "sunset sky", "green valley",
)
WOTD_FALLBACK_ORIENTATION = "landscape"
WOTD_MAX_AGE = 300  # seconds; never longer than the time left until UTC midnight
_WOTD_COLUMNS = WALLPAPER_PUBLIC_COLUMNS
_wotd_cache: dict = {}  # "YYYY-MM-DD" (UTC) -> wallpaper dict (today's entry only)

def utc_day(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")

def _day_number(day: str) -> int:
    """Stable integer for a date string (identical in every process, on every machine)."""
    return int.from_bytes(hashlib.sha256(day.encode("ascii")).digest()[:8], "big")

def _seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - now).total_seconds()))

def pick_upload_for_day(day: str) -> Optional[dict]:
    """The featured approved upload for `day`, or None when there are no approved uploads.
    Blocking (database): call it through run_in_threadpool. Only runs on the first request of the day."""
    if USE_SUPABASE:
        return sb_pick_upload_for_day(day)
    n = _day_number(day)
    with db() as conn:
        for extra in (" AND (width = 0 OR width >= height)", ""):  # landscape first, then anything
            where = "approved = 1" + extra  # constants only: no user input in the SQL
            count = conn.execute(f"SELECT COUNT(*) FROM wallpapers WHERE {where}").fetchone()[0]
            if count:
                row = conn.execute(
                    f"SELECT {_WOTD_COLUMNS} FROM wallpapers WHERE {where} ORDER BY id LIMIT 1 OFFSET ?",
                    (n % count,),
                ).fetchone()
                return dict(row)
    return None

async def pick_unsplash_for_day(app: FastAPI, day: str) -> Optional[dict]:
    """Deterministic curated pick: the date chooses the query, then one of its first-page results."""
    n = _day_number(day)
    query = WOTD_FALLBACK_QUERIES[n % len(WOTD_FALLBACK_QUERIES)]
    data = await fetch_unsplash_page(app, query, 1, WOTD_FALLBACK_ORIENTATION)
    results = data["results"]
    return results[(n // len(WOTD_FALLBACK_QUERIES)) % len(results)] if results else None

@app.get("/api/wallpaper-of-the-day", dependencies=[Depends(search_limit)])
async def wallpaper_of_the_day(request: Request):
    day = utc_day()
    data = _wotd_cache.get(day)  # O(1): no database, no Unsplash
    if data is None:
        picked = await run_in_threadpool(pick_upload_for_day, day)
        if picked:
            data = {**picked, "source": "upload", "date": day}
        else:
            if not UNSPLASH_ACCESS_KEY:
                raise HTTPException(status_code=503, detail="No wallpaper available today.")
            photo = await pick_unsplash_for_day(request.app, day)  # an upstream error propagates and is NOT cached
            if photo is None:
                raise HTTPException(status_code=404, detail="No wallpaper available today.")
            data = {**photo, "source": "unsplash", "date": day}
        _wotd_cache.clear()  # drop yesterday's entry
        _wotd_cache[day] = data

    max_age = min(WOTD_MAX_AGE, _seconds_until_utc_midnight())
    return JSONResponse(data, headers={"Cache-Control": f"public, max-age={max_age}"})

@app.get("/api/random", dependencies=[Depends(search_limit)])
async def random_photos(
    request: Request,
    response: Response,
    count: int = Query(HOME_DEFAULT_SHOWN, ge=1, le=30),
    orientation: Optional[str] = Query("landscape"),   # plain str: no Literal -> no 422
):

    """A fresh random sample of the cached pool on every call (home page mix)."""
    if not UNSPLASH_ACCESS_KEY:
        raise HTTPException(status_code=503, detail="Unsplash access key not configured on server.")

    pool = await get_home_pool(request.app, normalize_orientation(orientation))
    picked = random.sample(pool, min(count, len(pool))) if pool else []
    response.headers["Cache-Control"] = "no-store"  # the browser must not cache the shuffle
    return {"results": picked}


@app.get("/api/photos", dependencies=[Depends(search_limit)])
@app.get("/api/search", include_in_schema=False, dependencies=[Depends(search_limit)])  # alias, remove once unused
async def search_photos(
    request: Request,
    query: str = Query("", max_length=200),
    cursor: Optional[str] = Query(None, max_length=300),   # CHANGED: replaces the old ?page= offset
    orientation: Optional[str] = Query(None),
):
    """Search Unsplash. Collects up to TARGET_RESULTS photos per browser request.

    Cursor pagination: the first request has no cursor. Every response carries `next_cursor` (null on the
    last page); send it back unchanged as ?cursor= to get the page that follows.
    """
    if not UNSPLASH_ACCESS_KEY:
        raise HTTPException(status_code=503, detail="Unsplash access key not configured on server.")

    orientation = normalize_orientation(orientation)
    search_query = to_english_query(" ".join(query.split()).lower())
    if not search_query or BANNED_RE.search(search_query):
        return {"results": [], "next_cursor": None}  # off-topic or untranslatable: no Unsplash call spent

    first_page = not cursor
    current = 1 if first_page else decode_cursor(cursor, search_query, orientation)
    seen = set()
    results = []
    next_cursor = None
    total = 0

    for i in range(MAX_UPSTREAM_CALLS):
        data = await fetch_unsplash_page(request.app, search_query, current, orientation)
        total = data["total"]

        # Relevance gate: only on the very first upstream call of the first page
        if first_page and i == 0 and (total == 0 or not data.get("any_match", True)):
            return {"results": [], "next_cursor": None, "total": 0}

        for photo in data["results"]:
            if photo["id"] in seen:
                continue
            seen.add(photo["id"])
            results.append(photo)

        has_more = current < min(data["total_pages"], MAX_PAGE)
        next_cursor = encode_cursor(current + 1, search_query, orientation) if has_more else None
        if not has_more or len(results) >= TARGET_RESULTS:
            break
        current += 1

    return {"results": results, "next_cursor": next_cursor, "total": total}


@app.get("/api/photos/{photo_id}", dependencies=[Depends(photo_limit)])
async def photo_detail(photo_id: str, request: Request):
    """One photo by id, for shared links (?photo=ID) that point outside the current grid.
    Returns the same slim shape as /api/photos, so the browser's normalizeItem() handles it unchanged."""
    if not UNSPLASH_ACCESS_KEY:
        raise HTTPException(status_code=503, detail="Unsplash access key not configured on server.")
    if not PHOTO_ID_RE.fullmatch(photo_id):
        raise HTTPException(status_code=404, detail="Not found")

    now = time.monotonic()
    hit = _photo_cache.get(photo_id)
    if hit and hit[0] > now:
        photo = hit[1]
    else:
        try:
            response = await request.app.state.http.get(f"{UNSPLASH_API}/photos/{photo_id}")
            if response.status_code == 404:
                photo = None
            else:
                response.raise_for_status()
                raw = response.json()
                photo = slim_photo(raw) if is_allowed_photo(raw) else None
        except httpx.HTTPError as exc:
            raise _upstream_error(exc)
        except ValueError:
            raise HTTPException(status_code=502, detail="Unsplash returned invalid data.")

        if len(_photo_cache) >= PHOTO_CACHE_MAX:             # bounded memory
            _photo_cache.pop(next(iter(_photo_cache)))
        _photo_cache[photo_id] = (now + (3600 if photo else 300), photo)   # misses are cached too (quota)

    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return JSONResponse(photo, headers={"Cache-Control": "public, max-age=3600"})


@app.post("/api/photos/{photo_id}/download", status_code=204, dependencies=[Depends(download_limit)])
async def track_download(photo_id: str, request: Request):
    """Unsplash API guidelines: every download must be reported (the server holds the API key)."""
    if PHOTO_ID_RE.fullmatch(photo_id):
        try:
            await request.app.state.http.get(f"{UNSPLASH_API}/photos/{photo_id}/download")
        except httpx.HTTPError:
            pass


# ---- admin endpoints (X-Admin-Token header required)

@app.get("/api/get-messages", dependencies=ADMIN)
def get_messages():
    with db() as conn:
        rows = conn.execute("SELECT id, username, text FROM messages ORDER BY id DESC LIMIT 500").fetchall()
    return [dict(r) for r in rows]


@app.delete("/api/messages/{message_id}", dependencies=ADMIN)
def delete_message(message_id: int):
    with db() as conn:
        conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
    return {"ok": True}


@app.get("/api/admin/wallpapers", dependencies=ADMIN)
def admin_list_wallpapers():
    if USE_SUPABASE:
        return sb_admin_list_wallpapers()
    with db() as conn:
        rows = conn.execute(
            "SELECT id, title, description, image_url, thumb_url, approved "
            "FROM wallpapers ORDER BY approved ASC, id DESC LIMIT 100"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/admin/wallpapers/{wallpaper_id}/approve", dependencies=ADMIN)
def approve_wallpaper(wallpaper_id: int):
    if USE_SUPABASE:
        updated = sb_approve_wallpaper(wallpaper_id)
    else:
        with db() as conn:
            updated = conn.execute("UPDATE wallpapers SET approved = 1 WHERE id = ?", (wallpaper_id,)).rowcount
    if not updated:
        raise HTTPException(status_code=404, detail="Wallpaper not found.")
    _wotd_cache.clear()                                   # NEW
    return {"ok": True}

@app.delete("/api/admin/wallpapers/{wallpaper_id}", dependencies=ADMIN)
def delete_wallpaper(wallpaper_id: int):
    if USE_SUPABASE:
        if not sb_delete_wallpaper(wallpaper_id):
            raise HTTPException(status_code=404, detail="Wallpaper not found.")
    else:
        with db() as conn:
            row = conn.execute("SELECT image_url, thumb_url FROM wallpapers WHERE id = ?", (wallpaper_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Wallpaper not found.")
            conn.execute("DELETE FROM wallpapers WHERE id = ?", (wallpaper_id,))
        remove_files(
            os.path.join(UPLOAD_DIR, os.path.basename(row["image_url"])),
            os.path.join(THUMB_DIR, os.path.basename(row["thumb_url"])) if row["thumb_url"] else None,
        )
    _wotd_cache.clear()
    return {"ok": True}


@app.post("/api/admin/backup", dependencies=ADMIN + [Depends(backup_limit)])
def admin_backup():
    """Creates a verified online backup of the local SQLite database (SQLite backup API; safe while the site is
    running). With Supabase the wallpapers are NOT in this file (use Supabase's own backups for them); it holds the
    visitor messages. The backup stays on the server (BACKUP_DIR). The response carries the file NAME only."""
    try:
        result = backup_database()
    except BackupInProgress:
        raise HTTPException(status_code=409, detail="A backup is already running.")
    except Exception:
        logger.exception("Database backup failed")
        raise HTTPException(status_code=500, detail="Backup failed. See the server log.")
    logger.info("Database backup created: %s (%d bytes, %d old removed)", result["file"], result["size"], result["removed"])
    return {"ok": True, "file": result["file"], "size": result["size"], "removed": result["removed"]}


@app.api_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False)
async def healthz():
    return PlainTextResponse("ok", headers={"Cache-Control": "no-store"})


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(os.path.join(STATIC_DIR, "icons", "icon-192.png"))


# ---------------------------------------------------------------- command line
#   python main.py backup [--dest DIR] [--keep N]
#   python main.py migrate-wallpapers
# (the web server is still started with `uvicorn main:app ...`; this block only runs for `python main.py ...`)


def migrate_local_wallpapers() -> int:
    """One-off copy of the wallpapers of the OLD local storage (SQLite table + static/uploads) to Supabase.
    Safe to run again: files are overwritten and rows are matched on their (new) image_url, so nothing is duplicated.
    Rows whose files are missing are skipped. Rows that already point at an http(s) URL are skipped."""
    if not USE_SUPABASE:
        print("Set SUPABASE_URL and SUPABASE_SECRET_KEY first (e.g. in .env).", file=sys.stderr)
        return 1
    if not os.path.isfile(DB_FILE):
        print("No local database.db found: nothing to migrate.")
        return 0
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM wallpapers ORDER BY id").fetchall()
    except sqlite3.Error as exc:
        print(f"Could not read the local wallpapers table: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    moved = skipped = failed = 0
    for row in rows:
        columns = row.keys()

        def field(name, default=""):
            return row[name] if name in columns and row[name] is not None else default

        old_url = str(field("image_url"))
        old_name = os.path.basename(old_url)
        ext = os.path.splitext(old_name)[1].lower()
        full_path = os.path.join(UPLOAD_DIR, old_name)
        if old_url.startswith(("http://", "https://")) or ext not in FORMAT_BY_EXT or not os.path.isfile(full_path):
            print(f"Skipped (no local file): {old_url}")
            skipped += 1
            continue

        stem = os.path.splitext(old_name)[0]
        if not re.fullmatch(r"[A-Za-z0-9_-]+", stem):        # legacy names with spaces etc. are not valid object keys
            stem = hashlib.sha1(old_name.encode("utf-8")).hexdigest()
        full_key, thumb_key = stem + ext, f"thumbs/{stem}.webp"
        old_thumb = os.path.join(THUMB_DIR, os.path.basename(str(field("thumb_url")))) if field("thumb_url") else ""
        try:
            with open(full_path, "rb") as handle:
                sb_upload(full_key, handle.read(), CONTENT_TYPE_BY_FORMAT[FORMAT_BY_EXT[ext]], upsert=True)
            new_thumb = ""
            if old_thumb and os.path.isfile(old_thumb):
                with open(old_thumb, "rb") as handle:
                    sb_upload(thumb_key, handle.read(), "image/webp", upsert=True)
                new_thumb = supabase_public_url(thumb_key)
            supabase_client.table(SUPABASE_TABLE).upsert({
                "title": str(field("title")) or "Untitled Wallpaper",
                "description": str(field("description")),
                "image_url": supabase_public_url(full_key),
                "thumb_url": new_thumb,
                "lqip": str(field("lqip")),
                "width": int(field("width", 0)),
                "height": int(field("height", 0)),
                "approved": 1 if field("approved", 1) else 0,
            }, on_conflict="image_url").execute()
            moved += 1
            print(f"Migrated: {old_name}")
        except Exception as exc:
            failed += 1
            print(f"FAILED: {old_name} ({type(exc).__name__}: {exc})", file=sys.stderr)

    print(f"Done: {moved} migrated, {skipped} skipped, {failed} failed.")
    return 1 if failed else 0


def _cli(argv=None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="main.py", description="Green Wings maintenance commands.")
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("backup", help="Create a verified online backup of the database.")
    backup.add_argument("--dest", default=None, help="Backup folder (default: BACKUP_DIR or ./backups).")
    backup.add_argument("--keep", type=int, default=None, help="How many backups to keep (default: BACKUP_KEEP or 14).")
    commands.add_parser(
        "migrate-wallpapers",
        help="Copy the wallpapers of the old local storage (database.db + static/uploads) to Supabase.",
    )
    args = parser.parse_args(argv)

    if args.command == "backup":
        try:
            result = backup_database(args.dest, args.keep)
        except Exception as exc:
            print(f"Backup failed: {exc}", file=sys.stderr)
            return 1
        print(f"Backup created: {result['path']} ({result['size']} bytes, {result['removed']} old backup(s) removed)")
    elif args.command == "migrate-wallpapers":
        return migrate_local_wallpapers()
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())