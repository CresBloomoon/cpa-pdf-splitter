import re
import unicodedata
import fitz  # PyMuPDF


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "")


CHAPTER_LINE_RE = re.compile(r"^第\s*(\d+)\s*章\s*(.*)$")
CHAPTER_ANYWHERE_RE = re.compile(r"第\s*\d+\s*章")


def _is_toc_page(text: str) -> bool:
    """
    目次ページっぽいものを弾く。
    - "目次" を含む
    - "第◯章" が同一ページに複数回出る（目次はだいたい複数出る）
    """
    t = _norm(text)

    if "目次" in t:
        return True

    hits = CHAPTER_ANYWHERE_RE.findall(t)
    if len(hits) >= 2:
        return True

    return False


def detect_chapters(pdf_path: str):
    """
    戻り値:
      [{"chapter_no": 1, "title": "租税法総論", "page_index": 12}, ...]
    page_index は 0始まり
    """
    doc = fitz.open(pdf_path)
    found = []

    for i, page in enumerate(doc):
        text = _norm(page.get_text("text"))

        # ★追加：目次ページを弾く
        if _is_toc_page(text):
            continue

        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

        # 先頭付近だけ見る（誤爆を減らす）
        head = lines[:12]
        if not head:
            continue

        for idx, ln in enumerate(head):
            m = CHAPTER_LINE_RE.match(ln)
            if not m:
                continue

            chap_no = int(m.group(1))
            title = m.group(2).strip()

            # 「第2章」だけの行 → 次行をタイトル扱い
            if not title and idx + 1 < len(head):
                title = head[idx + 1].strip()

            if not title:
                title = "（無題）"

            found.append({"chapter_no": chap_no, "title": title, "page_index": i})
            break

    doc.close()

    # 同じ章番号が複数回取れても最初だけ採用
    uniq = {}
    for item in found:
        uniq.setdefault(item["chapter_no"], item)

    return [uniq[k] for k in sorted(uniq.keys())]
