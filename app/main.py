from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.responses import HTMLResponse, Response, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

import os
import shutil
import re
from urllib.parse import quote

import fitz  # PyMuPDF

from pdf_chapters import detect_chapters
from pdf_splitter import split_pdf_to_zip_bytes, build_chapter_ranges

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# static配信
app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _ascii_fallback_filename(name: str) -> str:
    """
    Content-Disposition の filename= はASCII推奨。
    日本語などは '_' に潰して安全にする。
    """
    base = re.sub(r'[^A-Za-z0-9._-]+', "_", name)
    base = base.strip("_")
    return base or "chapters.zip"


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/preview")
async def preview(file: UploadFile = File(...)):
    # 保存
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 章検出
    chapters = detect_chapters(file_path)
    ranges = build_chapter_ranges(file_path, chapters) if chapters else []

    # 表示用（1始まりのページ番号も付与）
    for r in ranges:
        r["start_page"] = r["start_index"] + 1
        r["end_page"] = r["end_index"] + 1

    return JSONResponse({
        "filename": file.filename,
        "chapters": ranges
    })


@app.get("/page_image")
def page_image(filename: str, page: int, dpi: int = 130):
    """
    PDFの指定ページをPNGで返す
    page は 0始まり
    """
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="file not found")

    doc = fitz.open(file_path)
    try:
        if page < 0 or page >= doc.page_count:
            raise HTTPException(status_code=400, detail="invalid page")

        pix = doc[page].get_pixmap(dpi=dpi)
        png_bytes = pix.tobytes("png")
        return Response(content=png_bytes, media_type="image/png")
    finally:
        doc.close()


@app.post("/upload")
async def upload_and_split(file: UploadFile = File(...)):
    # 保存
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 章検出
    chapters = detect_chapters(file_path)
    if not chapters:
        return {"message": "uploaded", "filename": file.filename, "chapters": []}

    # ZIP生成
    zip_bytes = split_pdf_to_zip_bytes(file_path, chapters)

    # 日本語ファイル名をHTTPヘッダーで安全に扱うため
    # filename= にはASCII fallback、filename*= にUTF-8を載せる（RFC 5987）
    zip_name = os.path.splitext(file.filename)[0] + "_chapters.zip"
    zip_name_ascii = _ascii_fallback_filename(zip_name)
    zip_name_utf8 = quote(zip_name)

    headers = {
        "Content-Disposition": f"attachment; filename=\"{zip_name_ascii}\"; filename*=UTF-8''{zip_name_utf8}"
    }
    return Response(content=zip_bytes, media_type="application/zip", headers=headers)
