from pathlib import Path
from fastapi.responses import FileResponse, HTMLResponse
import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

app = FastAPI()

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

@app.get("/", response_class=HTMLResponse)
async def read_index():
     index_path = TEMPLATES_DIR / "templates.html"
     if index_path.exists():
         return FileResponse(index_path)
     return HTMLResponse("<h2>Template File Not Found inside templates/</h2>", status_code=404)

@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    sw_path = STATIC_DIR / "sw.js"
    if sw_path.exists():
        return FileResponse(sw_path, media_type="text/javascript", headers={"Cache-Control": "no-cache"} )
    return HTMLResponse("sw.js not found", status_code=404)


@app.get("/manifest.webmanifest", include_in_schema=False)
async def manifest():
    manifest_path = STATIC_DIR / "manifest.webmanifest"
    if manifest_path.exists():
        return FileResponse(manifest_path, media_type="application/manifest+json", headers={"Cache-Control": "public, max-age=86400"} )
    return HTMLResponse("manifest not found", status_code=404)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")