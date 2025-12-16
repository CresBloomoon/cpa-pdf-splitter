// ====== チューニング ======
const THUMB_DPI = 60;   // サムネ軽量
const VIEW_DPI  = 150;  // モーダル表示

function calcBatchSize() {
  // 画面幅に合わせて「列数×4行」ぶん表示
  const cardMin = 180; // styles.css の minmax(180px, 1fr) と揃える
  const cols = Math.max(2, Math.floor(window.innerWidth / cardMin));
  const rows = 4;
  return cols * rows;
}

// ====== DOM ======
const dropZone = document.getElementById("drop-zone");
const status = document.getElementById("status");
const splitBtn = document.getElementById("split-btn");
const downloadBtn = document.getElementById("download-btn");
const resetBtn = document.getElementById("reset-btn");

const previewBox = document.getElementById("preview");
const previewFile = document.getElementById("preview-file");
const previewBody = document.getElementById("preview-body");

// modal
const modalBackdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const modalImg = document.getElementById("modal-img");
const mFirst = document.getElementById("m-first");
const mPrev = document.getElementById("m-prev");
const mNext = document.getElementById("m-next");
const mLast = document.getElementById("m-last");
const mIndicator = document.getElementById("m-indicator");

// ====== state ======
let currentFile = null;      // /upload用
let currentFilename = null;  // /page_image用
let zipBlob = null;
let zipFilename = null;

// expand state（同時に1章だけ）
let expandedChapterNo = null;
let expandedRowEl = null;
let loadedUntil = null;

// modal state
let modalChapter = null;
let modalPageIndex = 0;

// ====== helpers ======
function resetState(message = "") {
  currentFile = null;
  currentFilename = null;
  zipBlob = null;
  zipFilename = null;

  splitBtn.disabled = true;
  downloadBtn.disabled = true;
  resetBtn.disabled = true;

  previewBody.innerHTML = "";
  previewBox.style.display = "none";
  previewFile.textContent = "";

  closeExpanded();
  closeModal();

  status.textContent = message;
}

function setReadyToDownload(blob, filename) {
  zipBlob = blob;
  zipFilename = filename;
  downloadBtn.disabled = false;
  resetBtn.disabled = false;
}

function pageImageUrl(pageIndex, dpi) {
  const fn = encodeURIComponent(currentFilename);
  return `/page_image?filename=${fn}&page=${pageIndex}&dpi=${dpi}&t=${Date.now()}`;
}

// ====== modal ======
function openModal(ch, pageIndex) {
  modalChapter = ch;
  modalPageIndex = pageIndex;
  modalBackdrop.style.display = "flex";
  renderModal();
}

function closeModal() {
  modalBackdrop.style.display = "none";
  modalChapter = null;
}

function renderModal() {
  if (!modalChapter) return;

  const min = modalChapter.start_index;
  const max = modalChapter.end_index;

  if (modalPageIndex < min) modalPageIndex = min;
  if (modalPageIndex > max) modalPageIndex = max;

  modalTitle.textContent =
    `第${modalChapter.chapter_no}章 ${modalChapter.title}（p${modalChapter.start_page}〜p${modalChapter.end_page}）`;

  const p1 = modalPageIndex + 1;
  mIndicator.textContent = `表示中: p${p1} / 章内 p${min+1}〜p${max+1}`;

  modalImg.src = pageImageUrl(modalPageIndex, VIEW_DPI);

  mFirst.disabled = (modalPageIndex <= min);
  mPrev.disabled  = (modalPageIndex <= min);
  mNext.disabled  = (modalPageIndex >= max);
  mLast.disabled  = (modalPageIndex >= max);
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

mFirst.addEventListener("click", () => { modalPageIndex = modalChapter.start_index; renderModal(); });
mLast.addEventListener("click",  () => { modalPageIndex = modalChapter.end_index;   renderModal(); });
mPrev.addEventListener("click",  () => { modalPageIndex -= 1;                      renderModal(); });
mNext.addEventListener("click",  () => { modalPageIndex += 1;                      renderModal(); });

// ====== expand (thumbnail cards) ======
function closeExpanded() {
  if (expandedRowEl) expandedRowEl.remove();
  expandedRowEl = null;
  expandedChapterNo = null;
  loadedUntil = null;
}

function renderExpanded(ch, anchorTr) {
  closeExpanded();

  expandedChapterNo = ch.chapter_no;
  loadedUntil = ch.start_index - 1;

  const tr = document.createElement("tr");
  tr.className = "expand-row";
  const td = document.createElement("td");
  td.colSpan = 4;

  const wrapper = document.createElement("div");
  wrapper.className = "expand-card";

  const header = document.createElement("div");
  header.className = "expand-header";

  const title = document.createElement("div");
  title.className = "expand-title";
  title.textContent = `第${ch.chapter_no}章 ${ch.title}（p${ch.start_page}〜p${ch.end_page}）`;

  const actions = document.createElement("div");
  actions.className = "expand-actions";

  const btnLoadMore = document.createElement("button");
  btnLoadMore.textContent = "さらに読み込む";

  const btnClose = document.createElement("button");
  btnClose.textContent = "閉じる";

  const hint = document.createElement("span");
  hint.className = "muted";
  hint.textContent = "（カードをクリックで拡大）";

  actions.appendChild(btnLoadMore);
  actions.appendChild(btnClose);
  actions.appendChild(hint);

  header.appendChild(title);
  header.appendChild(actions);

  const grid = document.createElement("div");
  grid.className = "thumb-grid";

  wrapper.appendChild(header);
  wrapper.appendChild(grid);
  td.appendChild(wrapper);
  tr.appendChild(td);

  anchorTr.insertAdjacentElement("afterend", tr);
  expandedRowEl = tr;

  function appendBatch() {
    const start = loadedUntil + 1;
    const batch = calcBatchSize();
    const end = Math.min(ch.end_index, start + batch - 1);

    for (let p = start; p <= end; p++) {
      const card = document.createElement("div");
      card.className = "thumb-card";
      card.addEventListener("click", () => openModal(ch, p));

      const img = document.createElement("img");
      img.className = "thumb-img";
      img.loading = "lazy";
      img.alt = `p${p+1}`;
      img.src = pageImageUrl(p, THUMB_DPI);

      const meta = document.createElement("div");
      meta.className = "thumb-meta";
      meta.innerHTML = `<span>p${p+1}</span><span>クリックで拡大</span>`;

      card.appendChild(img);
      card.appendChild(meta);
      grid.appendChild(card);
    }

    loadedUntil = end;

    if (loadedUntil >= ch.end_index) {
      btnLoadMore.disabled = true;
      btnLoadMore.textContent = "全部表示済み";
    }
  }

  btnLoadMore.addEventListener("click", appendBatch);
  btnClose.addEventListener("click", closeExpanded);

  appendBatch();
}

// ====== preview table ======
function renderPreview(filename, chapters) {
  previewBody.innerHTML = "";
  previewFile.textContent = filename;

  if (!chapters || chapters.length === 0) {
    previewBody.innerHTML = `<tr><td colspan="4">章が検出されませんでした</td></tr>`;
    previewBox.style.display = "block";
    return;
  }

  for (const ch of chapters) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.addEventListener("click", () => {
      if (!currentFilename) return;

      if (expandedChapterNo === ch.chapter_no) {
        closeExpanded();
        return;
      }
      renderExpanded(ch, tr);
    });

    const tdNo = document.createElement("td");
    tdNo.textContent = `第${ch.chapter_no}章`;

    const tdTitle = document.createElement("td");
    tdTitle.textContent = ch.title;

    const tdStart = document.createElement("td");
    tdStart.textContent = `p${ch.start_page}`;

    const tdEnd = document.createElement("td");
    tdEnd.textContent = `p${ch.end_page}`;

    tr.appendChild(tdNo);
    tr.appendChild(tdTitle);
    tr.appendChild(tdStart);
    tr.appendChild(tdEnd);

    previewBody.appendChild(tr);
  }

  previewBox.style.display = "block";
}

// ====== buttons ======
resetBtn.addEventListener("click", () => {
  resetState("リセットしました。別のPDFをドロップしてね。");
});

downloadBtn.addEventListener("click", () => {
  if (!zipBlob) return;

  const url = window.URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename || "chapters.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  status.textContent += "\nダウンロードしました。";
});

splitBtn.addEventListener("click", async () => {
  if (!currentFile) return;

  status.textContent = `分割中: ${currentFile.name}`;
  splitBtn.disabled = true;
  downloadBtn.disabled = true;

  const formData = new FormData();
  formData.append("file", currentFile);

  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      status.textContent = `分割できませんでした: ${JSON.stringify(data, null, 2)}`;
      splitBtn.disabled = false;
      return;
    }

    if (!res.ok) {
      status.textContent = "失敗: サーバーがエラーを返しました";
      splitBtn.disabled = false;
      return;
    }

    const blob = await res.blob();
    const base = currentFile.name.replace(/\.pdf$/i, "");
    const filename = `${base}_chapters.zip`;

    setReadyToDownload(blob, filename);
    status.textContent = `分割完了: ${currentFile.name}\n「ZIPをダウンロード」を押してね。`;

  } catch (err) {
    console.error(err);
    status.textContent = "エラー: 通信または処理で失敗しました";
    splitBtn.disabled = false;
  }
});

// ====== drag & drop ======
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  if (!file) return;

  resetState();
  currentFile = file;
  currentFilename = file.name;
  resetBtn.disabled = false;

  status.textContent = `プレビュー取得中: ${file.name}`;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/preview", { method: "POST", body: formData });
    if (!res.ok) {
      status.textContent = "失敗: プレビュー取得でエラー";
      return;
    }

    const data = await res.json();
    renderPreview(data.filename, data.chapters);

    if (data.chapters && data.chapters.length > 0) {
      splitBtn.disabled = false;
      status.textContent = `プレビューOK: ${file.name}\n章をクリック → ページカード確認 → 問題なければ「分割」`;
    } else {
      status.textContent = `プレビューは出たけど章が検出できない: ${file.name}`;
    }

  } catch (err) {
    console.error(err);
    status.textContent = "エラー: 通信または処理で失敗しました";
  }
});
