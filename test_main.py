"""Automated tests for main.py.   Run with:   pytest -q

Needs:  pip install pytest   (plus the normal requirements of main.py)

Nothing here touches your real database.db, static/uploads/ or the Unsplash API:
  * every test that needs storage gets a throw-away folder (pytest's tmp_path) via the `workspace` fixture;
  * the Unsplash call is replaced by a fake;
  * the TestClient is used WITHOUT `with`, so the app's lifespan (real DB + real HTTP client) is not started.
"""
import base64
import json
import os
import re
import sqlite3
import sys
import threading
from io import BytesIO

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import main  # noqa: E402  (must come after the sys.path line)

LIMITERS = ("message_limit", "upload_limit", "search_limit", "download_limit",
            "photo_limit", "admin_limit", "fail_limit", "backup_limit")


# ------------------------------------------------------------------ fixtures

@pytest.fixture(autouse=True)
def fresh_rate_limits():
    """The limiters are module-level singletons: empty them so tests never affect each other."""
    for name in LIMITERS:
        getattr(main, name).hits.clear()
    yield


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    """A private database + upload + backup folder for one test."""
    uploads = tmp_path / "static" / "uploads"
    thumbs = uploads / "thumbs"
    thumbs.mkdir(parents=True)
    monkeypatch.setattr(main, "DB_FILE", str(tmp_path / "test.db"))
    monkeypatch.setattr(main, "UPLOAD_DIR", str(uploads))
    monkeypatch.setattr(main, "THUMB_DIR", str(thumbs))
    monkeypatch.setattr(main, "BACKUP_DIR", str(tmp_path / "backups"))
    main.init_db()
    return tmp_path


@pytest.fixture
def client(workspace):
    return TestClient(main.app)


# ================================================================== 1. SQLite: WAL + pragmas

def test_connections_use_wal_and_the_requested_pragmas(workspace):
    with main.db() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1          # 1 == NORMAL
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000


def test_wal_mode_is_stored_in_the_database_file(workspace):
    plain = sqlite3.connect(main.DB_FILE)          # a connection that did NOT go through main.connect()
    try:
        assert plain.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    finally:
        plain.close()


def test_open_reader_does_not_block_the_writer(workspace):
    reader = main.connect()
    try:
        reader.execute("BEGIN")
        reader.execute("SELECT COUNT(*) FROM messages").fetchall()      # read transaction stays open
        with main.db() as writer:                                       # would hit "database is locked" without WAL
            writer.execute("INSERT INTO messages (username, text) VALUES ('a', 'b')")
        assert reader.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0   # reader keeps its snapshot
    finally:
        reader.close()
    with main.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 1


def test_db_rolls_back_on_error(workspace):
    with pytest.raises(RuntimeError):
        with main.db() as conn:
            conn.execute("INSERT INTO messages (username, text) VALUES ('a', 'b')")
            raise RuntimeError("boom")
    with main.db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


# ================================================================== 2. Backups

def _count(path, table="messages"):
    conn = sqlite3.connect(path)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def _backups():
    return sorted(os.listdir(main.BACKUP_DIR))


def test_backup_contains_data_that_is_still_only_in_the_wal(workspace):
    keeper = main.connect()          # an open connection stops SQLite from folding the WAL into database.db
    try:
        keeper.executemany("INSERT INTO messages (username, text) VALUES (?, ?)",
                           [("u", f"m{i}") for i in range(50)])
        keeper.commit()
        result = main.backup_database()
    finally:
        keeper.close()

    path = os.path.join(main.BACKUP_DIR, result["file"])
    assert _count(path) == 50
    assert result["size"] == os.path.getsize(path)


def test_backup_is_one_standalone_verified_file(workspace):
    result = main.backup_database()
    path = result["path"]
    assert re.fullmatch(r"database-\d{8}-\d{6}-\d{6}\.db", result["file"])
    assert _backups() == [result["file"]]                       # no .tmp, -wal or -shm left behind
    assert not os.path.exists(path + "-wal") and not os.path.exists(path + "-shm")
    conn = sqlite3.connect(path)
    try:
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
    finally:
        conn.close()


def test_backup_is_consistent_while_another_thread_keeps_writing(workspace):
    stop, errors = threading.Event(), []

    def writer():
        try:
            while not stop.is_set():
                with main.db() as conn:
                    conn.execute("INSERT INTO messages (username, text) VALUES ('w', 'x')")
        except Exception as exc:        # pragma: no cover - only filled on failure
            errors.append(exc)

    thread = threading.Thread(target=writer)
    thread.start()
    try:
        results = [main.backup_database(keep=5) for _ in range(3)]
    finally:
        stop.set()
        thread.join()

    assert not errors
    for result in results:
        conn = sqlite3.connect(result["path"])
        try:
            assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        finally:
            conn.close()


def test_backup_keeps_only_the_newest_files(workspace):
    names = [main.backup_database(keep=2)["file"] for _ in range(4)]
    assert _backups() == sorted(names)[-2:]


def test_backup_prunes_only_its_own_files(workspace):
    os.makedirs(main.BACKUP_DIR)
    stranger = os.path.join(main.BACKUP_DIR, "notes.txt")
    with open(stranger, "w") as handle:
        handle.write("keep me")
    for _ in range(3):
        main.backup_database(keep=1)
    assert os.path.exists(stranger)
    assert len([n for n in _backups() if n.startswith("database-")]) == 1


def test_backup_refuses_a_folder_inside_the_public_static_dir(workspace):
    inside = os.path.join(main.STATIC_DIR, "leaky-backups")
    with pytest.raises(ValueError):
        main.backup_database(dest_dir=inside)
    assert not os.path.exists(inside)             # refused BEFORE anything was created


def test_backup_without_a_database_fails_cleanly(workspace, monkeypatch):
    monkeypatch.setattr(main, "DB_FILE", str(workspace / "does-not-exist.db"))
    with pytest.raises(FileNotFoundError):
        main.backup_database()
    assert not os.path.exists(main.BACKUP_DIR)


def test_a_second_backup_at_the_same_time_is_refused(workspace):
    assert main._BACKUP_LOCK.acquire(blocking=False)
    try:
        with pytest.raises(main.BackupInProgress):
            main.backup_database()
    finally:
        main._BACKUP_LOCK.release()


def test_failed_backup_leaves_no_partial_file(workspace, monkeypatch):
    real_backup = sqlite3.Connection.backup

    class Exploding(sqlite3.Connection):
        """Copies everything, then fails: the worst moment for a backup to die."""
        def backup(self, target, **kwargs):
            real_backup(self, target, **kwargs)
            raise sqlite3.DatabaseError("simulated failure")

    def exploding_connect(path=None):
        conn = sqlite3.connect(main.DB_FILE, factory=Exploding)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(main, "connect", exploding_connect)
    with pytest.raises(sqlite3.DatabaseError):
        main.backup_database()
    assert os.listdir(main.BACKUP_DIR) == []                    # no .tmp and no half-finished final file
    assert not main._BACKUP_LOCK.locked()                       # the lock was released


def test_backup_endpoint_needs_the_admin_token(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    assert client.post("/api/admin/backup").status_code == 401
    assert client.post("/api/admin/backup", headers={"X-Admin-Token": "wrong"}).status_code == 401
    assert not os.path.exists(main.BACKUP_DIR)


def test_backup_endpoint_is_disabled_without_an_admin_token(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", None)
    assert client.post("/api/admin/backup", headers={"X-Admin-Token": "anything"}).status_code == 503


def test_backup_endpoint_creates_a_backup_and_never_leaks_the_path(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    with main.db() as conn:
        conn.execute("INSERT INTO messages (username, text) VALUES ('a', 'b')")

    response = client.post("/api/admin/backup", headers={"X-Admin-Token": "secret"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert os.sep not in body["file"] and "/" not in body["file"]
    assert str(main.BACKUP_DIR) not in json.dumps(body)
    assert _count(os.path.join(main.BACKUP_DIR, body["file"])) == 1


def test_backup_endpoint_answers_409_while_a_backup_runs(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    assert main._BACKUP_LOCK.acquire(blocking=False)
    try:
        response = client.post("/api/admin/backup", headers={"X-Admin-Token": "secret"})
    finally:
        main._BACKUP_LOCK.release()
    assert response.status_code == 409


def test_backup_cli(workspace, tmp_path, capsys):
    dest = tmp_path / "cli-backups"
    assert main._cli(["backup", "--dest", str(dest), "--keep", "3"]) == 0
    assert "Backup created" in capsys.readouterr().out
    assert len(os.listdir(dest)) == 1


def test_backup_cli_reports_failure_with_exit_code_1(workspace, monkeypatch, capsys):
    monkeypatch.setattr(main, "DB_FILE", str(workspace / "missing.db"))
    assert main._cli(["backup"]) == 1
    assert "Backup failed" in capsys.readouterr().err


# ================================================================== 3a. Cursor pagination

def raw_cursor(payload) -> str:
    """Builds a cursor by hand, the way an attacker (or a bug) could."""
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


def test_cursor_round_trip():
    cursor = main.encode_cursor(3, "forest", "landscape")
    assert main.decode_cursor(cursor, "forest", "landscape") == 3
    assert main.decode_cursor(main.encode_cursor(7, "sea", None), "sea", None) == 7


def test_cursor_is_url_safe_and_unpadded():
    cursor = main.encode_cursor(12, "snowy mountains", "portrait")
    assert re.fullmatch(r"[A-Za-z0-9_-]+", cursor)


def test_cursor_accepts_the_deepest_allowed_page():
    cursor = main.encode_cursor(main.MAX_PAGE, "forest", None)
    assert main.decode_cursor(cursor, "forest", None) == main.MAX_PAGE


@pytest.mark.parametrize("cursor, query, orientation", [
    (main.encode_cursor(2, "forest", None), "ocean", None),                  # belongs to another search
    (main.encode_cursor(2, "forest", "landscape"), "forest", "portrait"),    # belongs to another orientation
    (main.encode_cursor(2, "forest", "landscape"), "forest", None),
    ("!!!not-base64!!!", "forest", None),
    ("", "forest", None),
    ("e30", "forest", None),                                                 # {}
    (raw_cursor([1, 2, 3]), "forest", None),                                 # JSON, but not an object
    (raw_cursor("just a string"), "forest", None),
    (raw_cursor({"v": 1, "p": 0, "q": "forest", "o": None}), "forest", None),                  # page too low
    (raw_cursor({"v": 1, "p": -5, "q": "forest", "o": None}), "forest", None),
    (raw_cursor({"v": 1, "p": main.MAX_PAGE + 1, "q": "forest", "o": None}), "forest", None),  # page too high
    (raw_cursor({"v": 1, "p": True, "q": "forest", "o": None}), "forest", None),               # bool is not a page
    (raw_cursor({"v": 1, "p": "2", "q": "forest", "o": None}), "forest", None),                # string is not a page
    (raw_cursor({"v": 1, "p": 2.0, "q": "forest", "o": None}), "forest", None),                # float is not a page
    (raw_cursor({"v": 99, "p": 2, "q": "forest", "o": None}), "forest", None),                 # unknown version
    (raw_cursor({"p": 2, "q": "forest", "o": None}), "forest", None),                          # no version
    (base64.urlsafe_b64encode(b"\xff\xfe\xfd").decode(), "forest", None),                      # not UTF-8
    ("ünïcode", "forest", None),                                                               # not ASCII
])
def test_bad_cursors_are_rejected_with_400(cursor, query, orientation):
    with pytest.raises(HTTPException) as caught:
        main.decode_cursor(cursor, query, orientation)
    assert caught.value.status_code == 400


def make_photo(photo_id):
    return {"id": photo_id, "description": "forest", "width": 100, "height": 60, "color": "#000000",
            "blur_hash": None, "urls": {"raw": "https://images.unsplash.com/r", "regular": "https://images.unsplash.com/x"},
            "user": {"name": "Someone", "url": None}}


@pytest.fixture
def fake_unsplash(monkeypatch):
    """Every upstream page holds 5 photos; there are 5 pages in total. Returns the list of upstream calls."""
    calls = []

    async def fake(app, query, page, orientation):
        calls.append((query, page, orientation))
        return {"results": [make_photo(f"p{page}-{i}") for i in range(5)],
                "total_pages": 5, "total": 25, "any_match": True}

    monkeypatch.setattr(main, "fetch_unsplash_page", fake)
    monkeypatch.setattr(main, "UNSPLASH_ACCESS_KEY", "test-key")
    monkeypatch.setattr(main, "TARGET_RESULTS", 12)
    monkeypatch.setattr(main, "MAX_UPSTREAM_CALLS", 3)
    return calls


def test_first_request_needs_no_cursor_and_hands_out_the_next_one(client, fake_unsplash):
    body = client.get("/api/photos", params={"query": "forest"}).json()
    assert [call[1] for call in fake_unsplash] == [1, 2, 3]          # stops once 12+ photos were collected
    assert len(body["results"]) == 15
    assert main.decode_cursor(body["next_cursor"], "forest", None) == 4   # points at the NEXT upstream page


def test_following_the_cursor_walks_every_page_exactly_once(client, fake_unsplash):
    ids, cursor, requests_made = [], None, 0
    while True:
        params = {"query": "forest"}
        if cursor:
            params["cursor"] = cursor
        body = client.get("/api/photos", params=params).json()
        requests_made += 1
        ids += [photo["id"] for photo in body["results"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
        assert requests_made < 10, "cursor never ended"

    assert requests_made == 2
    assert len(ids) == 25 and len(set(ids)) == 25                     # nothing missing, nothing twice
    assert [call[1] for call in fake_unsplash] == [1, 2, 3, 4, 5]


def test_last_page_has_a_null_cursor(client, fake_unsplash):
    cursor = main.encode_cursor(5, "forest", None)
    body = client.get("/api/photos", params={"query": "forest", "cursor": cursor}).json()
    assert body["next_cursor"] is None
    assert len(body["results"]) == 5


def test_a_cursor_cannot_be_reused_for_another_search(client, fake_unsplash):
    cursor = client.get("/api/photos", params={"query": "forest"}).json()["next_cursor"]
    assert client.get("/api/photos", params={"query": "ocean", "cursor": cursor}).status_code == 400


def test_a_cursor_cannot_be_reused_for_another_orientation(client, fake_unsplash):
    cursor = client.get("/api/photos", params={"query": "forest", "orientation": "landscape"}).json()["next_cursor"]
    response = client.get("/api/photos", params={"query": "forest", "orientation": "portrait", "cursor": cursor})
    assert response.status_code == 400


def test_a_forged_cursor_is_rejected_before_any_upstream_call(client, fake_unsplash):
    response = client.get("/api/photos", params={"query": "forest", "cursor": raw_cursor({"v": 1, "p": 999999})})
    assert response.status_code == 400
    assert fake_unsplash == []


def test_oversized_cursor_parameter_is_rejected_by_validation(client, fake_unsplash):
    response = client.get("/api/photos", params={"query": "forest", "cursor": "A" * 301})
    assert response.status_code == 422
    assert fake_unsplash == []


def test_banned_query_spends_no_upstream_call(client, fake_unsplash):
    assert client.get("/api/photos", params={"query": "sports car"}).json() == {"results": [], "next_cursor": None}
    assert fake_unsplash == []


def test_arabic_query_is_translated_before_the_upstream_call(client, fake_unsplash):
    client.get("/api/photos", params={"query": "غابة"})
    assert fake_unsplash[0][0] == "forest"


def test_unknown_orientation_is_ignored_not_a_422(client, fake_unsplash):
    response = client.get("/api/photos", params={"query": "forest", "orientation": "diagonal"})
    assert response.status_code == 200
    assert fake_unsplash[0][2] is None


def test_irrelevant_first_page_returns_nothing(client, monkeypatch):
    async def irrelevant(app, query, page, orientation):
        return {"results": [make_photo("x1")], "total_pages": 5, "total": 25, "any_match": False}

    monkeypatch.setattr(main, "fetch_unsplash_page", irrelevant)
    monkeypatch.setattr(main, "UNSPLASH_ACCESS_KEY", "test-key")
    body = client.get("/api/photos", params={"query": "forest"}).json()
    assert body["results"] == [] and body["next_cursor"] is None


def test_search_is_503_without_an_unsplash_key(client, monkeypatch):
    monkeypatch.setattr(main, "UNSPLASH_ACCESS_KEY", None)
    assert client.get("/api/photos", params={"query": "forest"}).status_code == 503


# ================================================================== 3b. Upload re-encoding

def png_bytes(size=(32, 24), color=(30, 160, 60)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, "PNG")
    return buffer.getvalue()


def image_bytes(fmt: str, size=(32, 24)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (200, 40, 40)).save(buffer, fmt)
    return buffer.getvalue()


def noise_png(size=(64, 64)) -> bytes:
    buffer = BytesIO()
    Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3)).save(buffer, "PNG")
    return buffer.getvalue()


def upload(client, data: bytes, filename="wall.png", content_type="image/png", title="Test"):
    return client.post(main.UPLOAD_PATH,
                       files={"file": (filename, data, content_type)},
                       data={"title": title, "description": "a description"})


def stored_files():
    """Every file that ended up in the upload folder or its thumbs/ sub-folder."""
    found = []
    for folder in (main.UPLOAD_DIR, main.THUMB_DIR):
        found += [os.path.join(folder, n) for n in os.listdir(folder) if os.path.isfile(os.path.join(folder, n))]
    return found


def wallpaper_rows():
    with main.db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM wallpapers").fetchall()]


def assert_nothing_stored():
    assert stored_files() == []
    assert wallpaper_rows() == []


@pytest.mark.parametrize("fmt, ext, mime", [
    ("PNG", ".png", "image/png"),
    ("JPEG", ".jpg", "image/jpeg"),
    ("WEBP", ".webp", "image/webp"),
])
def test_valid_upload_is_stored_pending_with_thumbnail_and_placeholder(client, fmt, ext, mime):
    response = upload(client, image_bytes(fmt), f"photo{ext}", mime)
    assert response.status_code == 201
    assert response.json()["status"] == "pending"

    (row,) = wallpaper_rows()
    assert row["approved"] == 0                                         # never public before moderation
    assert (row["width"], row["height"]) == (32, 24)
    assert row["lqip"].startswith("data:image/webp;base64,")

    full = os.path.join(main.UPLOAD_DIR, os.path.basename(row["image_url"]))
    thumb = os.path.join(main.THUMB_DIR, os.path.basename(row["thumb_url"]))
    with Image.open(full) as image:
        assert image.format == fmt
    with Image.open(thumb) as image:
        assert image.format == "WEBP"
    assert client.get("/api/wallpapers").json() == []                   # pending uploads are not listed


def test_stored_file_is_a_re_encode_not_a_copy_of_the_upload(client):
    original = png_bytes()
    assert upload(client, original).status_code == 201
    (row,) = wallpaper_rows()
    with open(os.path.join(main.UPLOAD_DIR, os.path.basename(row["image_url"])), "rb") as handle:
        assert handle.read() != original


def test_jpeg_exif_and_comment_are_stripped(client):
    exif = Image.Exif()
    exif[0x010E] = "SECRET-DESCRIPTION"
    exif[0x013B] = "SECRET-ARTIST"
    buffer = BytesIO()
    Image.new("RGB", (40, 30), (10, 20, 30)).save(buffer, "JPEG", exif=exif.tobytes(), comment=b"SECRET-COMMENT")
    original = buffer.getvalue()
    assert Image.open(BytesIO(original)).getexif().get(0x010E) == "SECRET-DESCRIPTION"   # the source really has it

    assert upload(client, original, "p.jpg", "image/jpeg").status_code == 201
    (row,) = wallpaper_rows()
    path = os.path.join(main.UPLOAD_DIR, os.path.basename(row["image_url"]))
    with open(path, "rb") as handle:
        raw = handle.read()
    assert b"SECRET-DESCRIPTION" not in raw and b"SECRET-ARTIST" not in raw and b"SECRET-COMMENT" not in raw
    with Image.open(path) as image:
        assert len(image.getexif()) == 0


def test_png_text_chunks_are_stripped(client):
    info = PngImagePlugin.PngInfo()
    info.add_text("Secret", "SECRET-TEXT-CHUNK")
    buffer = BytesIO()
    Image.new("RGB", (30, 30), (1, 2, 3)).save(buffer, "PNG", pnginfo=info)
    original = buffer.getvalue()
    assert b"SECRET-TEXT-CHUNK" in original

    assert upload(client, original).status_code == 201
    (row,) = wallpaper_rows()
    with open(os.path.join(main.UPLOAD_DIR, os.path.basename(row["image_url"])), "rb") as handle:
        assert b"SECRET-TEXT-CHUNK" not in handle.read()


def test_bytes_appended_after_the_image_do_not_survive(client):
    payload = b"<?php echo 'TRAILING-PAYLOAD'; ?>"
    assert upload(client, png_bytes() + payload).status_code == 201
    (row,) = wallpaper_rows()
    with open(os.path.join(main.UPLOAD_DIR, os.path.basename(row["image_url"])), "rb") as handle:
        assert b"TRAILING-PAYLOAD" not in handle.read()


# ---- fake / hostile files

def test_text_file_pretending_to_be_a_png_is_rejected(client):
    response = upload(client, b"this is not an image at all", "evil.png", "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


def test_html_or_script_content_with_an_image_name_is_rejected(client):
    response = upload(client, b"<html><script>alert(1)</script></html>", "x.png", "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


def test_gif_renamed_to_png_is_rejected_because_only_jpeg_png_webp_are_decoded(client):
    response = upload(client, image_bytes("GIF"), "anim.png", "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


def test_jpeg_content_with_a_png_extension_is_rejected(client):
    response = upload(client, image_bytes("JPEG"), "wall.png", "image/png")
    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]
    assert_nothing_stored()


def test_png_content_with_a_jpg_extension_is_rejected(client):
    response = upload(client, png_bytes(), "wall.jpg", "image/jpeg")
    assert response.status_code == 400
    assert_nothing_stored()


def test_disallowed_content_type_is_rejected(client):
    response = upload(client, png_bytes(), "wall.png", "text/plain")
    assert response.status_code == 400
    assert_nothing_stored()


@pytest.mark.parametrize("filename", ["shell.php", "payload.svg", "noextension", "wall.png.exe", "wall.gif"])
def test_disallowed_extension_is_rejected(client, filename):
    response = upload(client, png_bytes(), filename, "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


def test_empty_file_is_rejected(client):
    response = upload(client, b"", "empty.png", "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


def test_truncated_image_is_rejected(client):
    data = noise_png()
    response = upload(client, data[: len(data) // 2], "cut.png", "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


def test_corrupt_image_body_is_rejected(client):
    data = bytearray(noise_png())
    for i in range(len(data) // 2, len(data) // 2 + 200):       # damage the compressed pixel data
        data[i] ^= 0xFF
    response = upload(client, bytes(data), "bad.png", "image/png")
    assert response.status_code == 400
    assert_nothing_stored()


# ---- oversized files and decompression bombs

def test_file_over_the_size_limit_is_rejected_with_413(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_FILE_SIZE", 1000)
    data = noise_png()
    assert len(data) > 1000
    response = upload(client, data)
    assert response.status_code == 413
    assert "too large" in response.json()["detail"]
    assert_nothing_stored()


def test_file_exactly_at_the_limit_is_still_accepted(client, monkeypatch):
    data = png_bytes()
    monkeypatch.setattr(main, "MAX_FILE_SIZE", len(data))
    assert upload(client, data).status_code == 201


def test_image_with_too_many_pixels_is_rejected_before_decoding(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_PIXELS", 100)                 # 32 x 24 = 768 px > 100
    response = upload(client, png_bytes())
    assert response.status_code == 400
    assert "too large" in response.json()["detail"]
    assert_nothing_stored()


def test_image_with_an_extreme_edge_is_rejected(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_EDGE", 20)                    # 32 px wide > 20
    response = upload(client, png_bytes())
    assert response.status_code == 400
    assert_nothing_stored()


# ---- the ASGI guard that runs before FastAPI parses the body (tested on its own, with a tiny limit)

@pytest.fixture
def guarded_client():
    reached = []

    async def endpoint(request):
        reached.append(request.url.path)
        body = await request.body()
        return PlainTextResponse(str(len(body)))

    inner = Starlette(routes=[Route("/api/up", endpoint, methods=["POST"]),
                              Route("/other", endpoint, methods=["POST"])])
    guarded = main.UploadSizeLimitMiddleware(inner, path="/api/up", max_body=1024)
    test_client = TestClient(guarded)
    test_client.reached = reached
    return test_client


def test_guard_rejects_a_declared_content_length_over_the_limit_without_reading_it(guarded_client):
    response = guarded_client.post("/api/up", content=b"x" * 2048)
    assert response.status_code == 413
    assert "too large" in response.json()["detail"]
    assert guarded_client.reached == []                          # the route never even started
    assert response.headers["x-content-type-options"] == "nosniff"      # security headers on the rejection too


def test_guard_cuts_off_a_streamed_body_that_has_no_content_length(guarded_client):
    def chunks():
        for _ in range(10):
            yield b"x" * 500

    response = guarded_client.post("/api/up", content=chunks())
    assert response.status_code == 413


def test_guard_lets_small_bodies_through(guarded_client):
    response = guarded_client.post("/api/up", content=b"x" * 500)
    assert response.status_code == 200 and response.text == "500"


def test_guard_ignores_other_paths(guarded_client):
    response = guarded_client.post("/other", content=b"x" * 5000)
    assert response.status_code == 200 and response.text == "5000"


# ================================================================== 3c. Trusted-proxy IP extraction

def make_request(peer, forwarded=None) -> Request:
    headers = [] if forwarded is None else [(b"x-forwarded-for", forwarded.encode())]
    return Request({"type": "http", "method": "GET", "path": "/", "query_string": b"", "headers": headers,
                    "scheme": "http", "server": ("testserver", 80),
                    "client": (peer, 50000) if peer else None})


@pytest.fixture
def proxies(monkeypatch):
    """Trusted: 127.0.0.1, ::1 and the 10.0.0.0/8 range."""
    monkeypatch.setattr(main, "TRUSTED_PROXIES", main._load_trusted_proxies("127.0.0.1, ::1, 10.0.0.0/8"))


def test_untrusted_peer_cannot_spoof_its_address(proxies):
    request = make_request("198.51.100.5", "6.6.6.6")
    assert main.get_client_ip(request) == "198.51.100.5"


def test_untrusted_peer_with_a_whole_forged_chain_is_still_itself(proxies):
    request = make_request("198.51.100.5", "1.1.1.1, 10.0.0.1, 127.0.0.1")
    assert main.get_client_ip(request) == "198.51.100.5"


def test_trusted_proxy_without_a_header_returns_the_proxy_address(proxies):
    assert main.get_client_ip(make_request("127.0.0.1")) == "127.0.0.1"
    assert main.get_client_ip(make_request("127.0.0.1", "")) == "127.0.0.1"


def test_trusted_proxy_forwards_the_real_visitor(proxies):
    assert main.get_client_ip(make_request("127.0.0.1", "203.0.113.7")) == "203.0.113.7"


def test_leftmost_entry_is_what_the_visitor_claimed_so_it_is_ignored(proxies):
    # the visitor sent "6.6.6.6"; our proxy appended the address it really saw
    assert main.get_client_ip(make_request("127.0.0.1", "6.6.6.6, 203.0.113.7")) == "203.0.113.7"


def test_chain_of_trusted_proxies_is_skipped_from_the_right(proxies):
    request = make_request("10.0.0.1", "203.0.113.7, 10.0.0.2, 10.0.0.3")
    assert main.get_client_ip(request) == "203.0.113.7"


def test_garbage_entry_stops_the_walk_at_the_last_trusted_address(proxies):
    assert main.get_client_ip(make_request("127.0.0.1", "203.0.113.7, not-an-ip")) == "127.0.0.1"
    assert main.get_client_ip(make_request("127.0.0.1", "unknown")) == "127.0.0.1"


def test_port_suffix_and_ipv6_forms_are_understood(proxies):
    assert main.get_client_ip(make_request("127.0.0.1", "203.0.113.7:51234")) == "203.0.113.7"
    assert main.get_client_ip(make_request("127.0.0.1", "[2001:db8::1]:443")) == "2001:db8::1"
    assert main.get_client_ip(make_request("127.0.0.1", "2001:db8::1")) == "2001:db8::1"


def test_ipv4_mapped_ipv6_peer_counts_as_its_ipv4_address(proxies):
    assert main.get_client_ip(make_request("::ffff:127.0.0.1", "203.0.113.7")) == "203.0.113.7"


def test_ipv6_loopback_proxy_is_trusted(proxies):
    assert main.get_client_ip(make_request("::1", "203.0.113.7")) == "203.0.113.7"


def test_only_the_last_hops_are_examined(proxies):
    # 10 trusted entries behind a forged leftmost one: the forged address must never be returned
    chain = "6.6.6.6, " + ", ".join(f"10.0.0.{i}" for i in range(1, main.MAX_FORWARDED_HOPS + 1))
    assert main.get_client_ip(make_request("127.0.0.1", chain)) != "6.6.6.6"


def test_empty_trusted_proxy_list_ignores_the_header_completely(monkeypatch):
    monkeypatch.setattr(main, "TRUSTED_PROXIES", main._load_trusted_proxies(""))
    assert main.TRUSTED_PROXIES == ()
    assert main.get_client_ip(make_request("127.0.0.1", "203.0.113.7")) == "127.0.0.1"


def test_missing_peer_gives_unknown(proxies):
    assert main.get_client_ip(make_request(None, "203.0.113.7")) == "unknown"


def test_non_ip_peer_is_never_trusted(proxies):
    assert main.get_client_ip(make_request("testclient", "203.0.113.7")) == "testclient"


def test_trusted_proxy_setting_accepts_plain_ips_and_cidr_but_not_wildcards():
    networks = main._load_trusted_proxies("*, bogus, 10.0.0.5, 172.18.0.0/16, ")
    assert [str(n) for n in networks] == ["10.0.0.5/32", "172.18.0.0/16"]


@pytest.mark.parametrize("text, expected", [
    ("203.0.113.7", "203.0.113.7"),
    ("  203.0.113.7  ", "203.0.113.7"),
    ("203.0.113.7:8080", "203.0.113.7"),
    ("[2001:db8::1]:443", "2001:db8::1"),
    ("::ffff:10.1.2.3", "10.1.2.3"),
])
def test_parse_ip(text, expected):
    assert str(main._parse_ip(text)) == expected


@pytest.mark.parametrize("text", ["", "unknown", "999.1.1.1", "1.2.3", "evil, 1.2.3.4", "1.2.3.4.5"])
def test_parse_ip_rejects_garbage(text):
    assert main._parse_ip(text) is None


def test_rate_limit_cannot_be_dodged_by_rotating_forged_headers(proxies):
    limiter = main.RateLimit(2, 60)
    for i in range(2):
        limiter(make_request("198.51.100.5", f"9.9.9.{i}"))      # direct visitor, new fake address every time
    with pytest.raises(HTTPException) as caught:
        limiter(make_request("198.51.100.5", "9.9.9.99"))
    assert caught.value.status_code == 429


def test_rate_limit_counts_visitors_behind_a_trusted_proxy_separately(proxies):
    limiter = main.RateLimit(1, 60)
    limiter(make_request("127.0.0.1", "203.0.113.1"))
    limiter(make_request("127.0.0.1", "203.0.113.2"))            # a different real visitor: its own bucket
    with pytest.raises(HTTPException):
        limiter(make_request("127.0.0.1", "203.0.113.1"))


# ================================================================== smoke test: nothing else broke

def test_healthz_and_security_headers(client):
    response = client.get("/healthz")
    assert response.status_code == 200 and response.text == "ok"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]


def test_message_endpoint_still_works_with_the_new_connection_setup(client):
    response = client.post("/api/send-message", json={"username": "Sam", "text": "hello"})
    assert response.status_code == 200
    with main.db() as conn:
        assert conn.execute("SELECT username, text FROM messages").fetchone()["text"] == "hello"


def test_admin_endpoints_still_require_the_token(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    assert client.get("/api/get-messages").status_code == 401
    assert client.get("/api/get-messages", headers={"X-Admin-Token": "secret"}).status_code == 200