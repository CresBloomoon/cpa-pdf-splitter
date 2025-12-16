import re
import io
import fitz
import zipfile
from typing import List, Dict


def _safe_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r'[\\/:*?"<>|]', "_", name)
    name = re.sub(r"\s+", " ", name)
    return name


def _page_text(doc: fitz.Document, idx: int) -> str:
    if idx < 0 or idx >= doc.page_count:
        return ""
    return (doc[idx].get_text("text") or "").strip()


def _looks_like_cover_page(text: str) -> bool:
    """
    今回の教材の「章扉ページ」に出がちな文言で判定
    （画像/文字混在でも刺さるやつ）
    """
    if not text:
        return False

    cover_markers = [
        "本試験出題実績",
        "学習管理表",
    ]
    if any(m in text for m in cover_markers):
        return True

    # 「第２章」だけの行があるケース（タイトルは次行）
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines:
        if re.match(r"^第\s*\d+\s*章$", lines[0]):
            return True

    return False


def _adjust_starts(doc: fitz.Document, chapters: List[Dict]) -> List[Dict]:
    """
    detect_chapters が返す page_index は「本文の開始」になりがちなので、
    直前(最大2ページ前まで)に「章扉っぽいページ」があればそこを開始にする。
    """
    adjusted = []
    for ch in chapters:
        start = ch["page_index"]

        # 1ページ前、2ページ前まで探す（教材によって扉が2ページあることもある）
        for back in (1, 2):
            prev_idx = start - back
            if prev_idx < 0:
                continue

            prev_text = _page_text(doc, prev_idx)
            if _looks_like_cover_page(prev_text):
                start = prev_idx

        adjusted.append({**ch, "start_index": start})

    adjusted.sort(key=lambda x: x["start_index"])
    return adjusted


def build_chapter_ranges(pdf_path: str, chapters: List[Dict]) -> List[Dict]:
    """
    プレビュー用：章ごとの start/end（0始まり）を返す
    戻り値: [{"chapter_no", "title", "start_index", "end_index"}, ...]
    """
    doc = fitz.open(pdf_path)
    total_pages = doc.page_count

    adjusted = _adjust_starts(doc, chapters)

    ranges: List[Dict] = []
    for idx, ch in enumerate(adjusted):
        start = ch["start_index"]
        if idx + 1 < len(adjusted):
            end = adjusted[idx + 1]["start_index"] - 1
        else:
            end = total_pages - 1

        if start <= end:
            ranges.append({
                "chapter_no": ch["chapter_no"],
                "title": ch["title"],
                "start_index": start,
                "end_index": end,
            })

    doc.close()
    return ranges


def split_pdf_to_zip_bytes(pdf_path: str, chapters: List[Dict]) -> bytes:
    doc = fitz.open(pdf_path)

    ranges = build_chapter_ranges(pdf_path, chapters)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for r in ranges:
            chapter_no = r["chapter_no"]
            title = _safe_filename(r["title"])
            out_name = f"第{chapter_no}章 {title}.pdf"

            out_doc = fitz.open()
            out_doc.insert_pdf(doc, from_page=r["start_index"], to_page=r["end_index"])
            zf.writestr(out_name, out_doc.tobytes())
            out_doc.close()

    doc.close()
    return buf.getvalue()
