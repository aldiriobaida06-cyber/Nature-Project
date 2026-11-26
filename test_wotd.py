"""Tests for GET /api/wallpaper-of-the-day.

Put this file next to main.py and run:   pytest -q test_wotd.py
Every test uses a temporary database and upload folder, so nothing real is touched. The TestClient is
used WITHOUT `with`, so the lifespan (and its shared httpx client) is not started: Unsplash is always faked.
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
import main
URL = "/api/wallpaper-of-the-day"
DAY = "2026-11-17"
NEXT_DAY = "2026-11-18"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    thumbs = uploads / "thumbs"
    thumbs.mkdir(parents=True)
    monkeypatch.setattr(main, "DB_FILE", str(tmp_path / "test.db"))
    monkeypatch.setattr(main, "UPLOAD_DIR", str(uploads))
    monkeypatch.setattr(main, "THUMB_DIR", str(thumbs))
    monkeypatch.setattr(main, "utc_day", lambda now=None: DAY)       # "today" is fixed unless a test changes it
    main._wotd_cache.clear()
    main.search_limit.hits.clear()
    main.admin_limit.hits.clear()
    main.fail_limit.hits.clear()
    main.init_db()
    yield TestClient(main.app)
    main._wotd_cache.clear()


def add_wallpaper(title, approved=1, width=1920, height=1080):
    with main.db() as conn:
        conn.execute(
            "INSERT INTO wallpapers (title, description, image_url, thumb_url, lqip, width, height, approved) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (title, "", f"/static/uploads/{title}.jpg", f"/static/uploads/thumbs/{title}.webp",
             "data:image/webp;base64,UklGRhoAAABXRUJQVlA4", width, height, approved),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def raw_photo(n):
    return {
        "id": f"photo{n:04d}",
        "description": f"Mountain {n}",
        "width": 4000,
        "height": 2500,
        "color": "#223344",
        "blur_hash": "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        "urls": {"raw": f"https://images.unsplash.com/photo-{n}?ixid=x",
                 "regular": f"https://images.unsplash.com/photo-{n}?w=1080"},
        "user": {"name": "Ada", "links": {"html": "https://unsplash.com/@ada"}},
    }


def fake_unsplash(monkeypatch, calls, fail=False):
    async def fake_page(app, query, page, orientation):
        calls.append((query, page, orientation))
        if fail:
            raise HTTPException(status_code=502, detail="Unsplash request failed.")
        return {"results": [main.slim_photo(raw_photo(n)) for n in range(1, 6)]}

    monkeypatch.setattr(main, "UNSPLASH_ACCESS_KEY", "test-key")
    monkeypatch.setattr(main, "fetch_unsplash_page", fake_page)


# ---------------------------------------------------------------- uploads first

def test_returns_upload_with_the_same_schema_as_the_feed(client):
    add_wallpaper("alps")
    response = client.get(URL)
    assert response.status_code == 200
    data = response.json()

    feed_item = client.get("/api/wallpapers").json()[0]
    assert set(feed_item) <= set(data)                      # every field of /api/wallpapers is present
    assert data["image_url"] == feed_item["image_url"]
    assert data["lqip"].startswith("data:image/webp;base64,")
    assert data["source"] == "upload"
    assert data["date"] == DAY
    assert "Content-Security-Policy" in response.headers    # the normal security headers still apply


def test_pending_uploads_are_never_featured(client, monkeypatch):
    add_wallpaper("pending", approved=0)
    monkeypatch.setattr(main, "UNSPLASH_ACCESS_KEY", None)
    assert client.get(URL).status_code == 503               # nothing approved, no Unsplash key


def test_pick_is_deterministic_for_a_date(client):
    for name in ("a", "b", "c", "d", "e"):
        add_wallpaper(name)
    first = client.get(URL).json()["title"]
    main._wotd_cache.clear()                                # not just the cache: the PICK itself is stable
    assert client.get(URL).json()["title"] == first


def test_pick_changes_with_the_date(client):
    for name in ("a", "b", "c", "d", "e"):
        add_wallpaper(name)
    titles = {main.pick_upload_for_day(f"2026-11-{d:02d}")["title"] for d in range(1, 29)}
    assert len(titles) > 1


def test_landscape_is_preferred_for_the_banner(client):
    add_wallpaper("tall", width=1080, height=1920)
    add_wallpaper("wide", width=1920, height=1080)
    for d in range(1, 29):
        assert main.pick_upload_for_day(f"2026-11-{d:02d}")["title"] == "wide"


def test_portrait_is_used_when_it_is_all_there_is(client):
    add_wallpaper("tall", width=1080, height=1920)
    assert main.pick_upload_for_day(DAY)["title"] == "tall"


# ---------------------------------------------------------------- memory cache

def test_repeat_requests_do_not_touch_sqlite(client, monkeypatch):
    add_wallpaper("alps")
    first = client.get(URL).json()

    def boom(day):
        raise AssertionError("SQLite was queried although today's pick is cached")

    monkeypatch.setattr(main, "pick_upload_for_day", boom)
    assert client.get(URL).json() == first


def test_cache_is_keyed_by_utc_date_and_holds_one_day(client, monkeypatch):
    add_wallpaper("alps")
    client.get(URL)
    assert list(main._wotd_cache) == [DAY]

    monkeypatch.setattr(main, "utc_day", lambda now=None: NEXT_DAY)
    assert client.get(URL).json()["date"] == NEXT_DAY
    assert list(main._wotd_cache) == [NEXT_DAY]             # yesterday's entry was dropped: memory stays O(1)


def test_cache_control_never_outlives_the_day(client):
    add_wallpaper("alps")
    header = client.get(URL).headers["Cache-Control"]
    assert header.startswith("public, max-age=")
    assert 1 <= int(header.rsplit("=", 1)[1]) <= main.WOTD_MAX_AGE


def test_admin_delete_and_approve_drop_the_cached_pick(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    headers = {"X-Admin-Token": "secret"}

    first = add_wallpaper("first")
    client.get(URL)
    assert main._wotd_cache
    assert client.delete(f"/api/admin/wallpapers/{first}", headers=headers).status_code == 200
    assert main._wotd_cache == {}

    second = add_wallpaper("second", approved=0)
    monkeypatch.setattr(main, "UNSPLASH_ACCESS_KEY", None)
    main._wotd_cache[DAY] = {"stale": True}
    assert client.post(f"/api/admin/wallpapers/{second}/approve", headers=headers).status_code == 200
    assert main._wotd_cache == {}


# ---------------------------------------------------------------- Unsplash fallback

def test_falls_back_to_a_curated_unsplash_photo(client, monkeypatch):
    calls = []
    fake_unsplash(monkeypatch, calls)

    response = client.get(URL)
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "unsplash"
    assert data["date"] == DAY
    assert set(data) >= {"id", "description", "width", "height", "color", "blur_hash", "urls", "user"}   # slim_photo shape
    assert calls[0][0] in main.WOTD_FALLBACK_QUERIES and calls[0][1] == 1

    assert client.get(URL).json() == data                   # second request: served from memory
    assert len(calls) == 1


def test_unsplash_errors_are_not_cached(client, monkeypatch):
    fake_unsplash(monkeypatch, [], fail=True)
    assert client.get(URL).status_code == 502
    assert main._wotd_cache == {}

    fake_unsplash(monkeypatch, [])
    assert client.get(URL).status_code == 200