/* Mini Word — ローカル docx ビューア
 *
 * .docx ファイルをブラウザだけで読み込み、Word のように紙面表示するアプリ。
 * 変換は mammoth.js（docx → HTML）を使用。
 */

(function () {
  "use strict";

  const els = {
    body: document.body,
    welcome: document.getElementById("welcome"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("fileInput"),
    paperWrap: document.getElementById("paperWrap"),
    paper: document.getElementById("paper"),
    paperScale: document.getElementById("paperScale"),
    workspace: document.getElementById("workspace"),
    docName: document.getElementById("docName"),
    docStats: document.getElementById("docStats"),
    status: document.getElementById("status"),
    footStatus: document.getElementById("footStatus"),
    footMeta: document.getElementById("footMeta"),

    openBtn: document.getElementById("openBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomValue: document.getElementById("zoomValue"),
    darkToggle: document.getElementById("darkToggle"),

    searchInput: document.getElementById("searchInput"),
    searchPrevBtn: document.getElementById("searchPrevBtn"),
    searchNextBtn: document.getElementById("searchNextBtn"),
    searchCounter: document.getElementById("searchCounter"),
  };

  /** 状態 */
  const state = {
    fileName: "",
    fileSize: 0,
    html: "",
    plainText: "",
    zoom: 1, // 1 = 100%
    search: {
      query: "",
      hits: [],
      activeIndex: -1,
    },
  };

  const ZOOM_STEPS = [0.5, 0.6, 0.75, 0.85, 1, 1.15, 1.25, 1.5, 1.75, 2];

  init();

  function init() {
    setupTheme();
    setupOpen();
    setupDragDrop();
    setupZoom();
    setupSearch();
    setupKeys();
    setupFooter();
    applyZoom();
    setFooter("準備完了");
  }

  // ---------- テーマ ----------
  function setupTheme() {
    const saved = localStorage.getItem("miniword.theme");
    const dark = saved === "dark";
    els.darkToggle.checked = dark;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    els.darkToggle.addEventListener("change", () => {
      const isDark = els.darkToggle.checked;
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
      localStorage.setItem("miniword.theme", isDark ? "dark" : "light");
    });
  }

  // ---------- 開く ----------
  function setupOpen() {
    els.openBtn.addEventListener("click", () => els.fileInput.click());
    els.dropzone.addEventListener("click", () => els.fileInput.click());
    els.dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.fileInput.click();
      }
    });

    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      if (file) handleFile(file);
      els.fileInput.value = "";
    });
  }

  // ---------- ドラッグ＆ドロップ（ページ全体） ----------
  function setupDragDrop() {
    let dragCounter = 0;
    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter++;
      els.body.classList.add("is-dragging");
      els.dropzone.classList.add("dragging");
    });
    window.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    window.addEventListener("dragleave", () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        els.body.classList.remove("is-dragging");
        els.dropzone.classList.remove("dragging");
      }
    });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter = 0;
      els.body.classList.remove("is-dragging");
      els.dropzone.classList.remove("dragging");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  function hasFiles(e) {
    if (!e.dataTransfer) return false;
    const types = e.dataTransfer.types;
    if (!types) return false;
    return Array.from(types).includes("Files");
  }

  // ---------- ファイル読み込み ----------
  async function handleFile(file) {
    if (!/\.docx$/i.test(file.name)) {
      const ok = confirm(
        `「${file.name}」は .docx 拡張子ではありません。\nそれでも開いてみますか？`
      );
      if (!ok) return;
    }

    setStatus(`「${file.name}」を読み込んでいます…`);
    setFooter("読み込み中…");
    try {
      const buf = await file.arrayBuffer();

      if (typeof window.mammoth === "undefined") {
        throw new Error(
          "mammoth.js を読み込めませんでした。インターネット接続を確認してください。"
        );
      }

      const result = await window.mammoth.convertToHtml(
        { arrayBuffer: buf },
        {
          // mammoth は既定で base64 画像にしてくれる
          includeDefaultStyleMap: true,
        }
      );
      const textResult = await window.mammoth.extractRawText({
        arrayBuffer: buf,
      });

      state.fileName = file.name;
      state.fileSize = file.size;
      state.html = result.value || "<p><em>(本文がありません)</em></p>";
      state.plainText = (textResult.value || "").trim();

      els.docName.textContent = file.name;
      els.paper.innerHTML = state.html;

      const stats = computeStats(state.plainText);
      const meta = [
        formatBytes(file.size),
        `${stats.chars.toLocaleString()} 文字`,
        `${stats.words.toLocaleString()} 単語`,
      ].join(" · ");
      els.docStats.textContent = meta;
      els.footMeta.textContent = meta;

      setupAnchors();
      enableControls(true);
      showPaper();
      setStatus("");

      const warnings = (result.messages || []).filter((m) => m.type !== "info");
      if (warnings.length) {
        setFooter(`読み込み完了（注意 ${warnings.length} 件）`);
        console.info("[mammoth] messages:", result.messages);
      } else {
        setFooter("読み込み完了");
      }

      applyZoom();

      // 検索ボックスがあれば再評価
      if (state.search.query) runSearch(state.search.query);
    } catch (err) {
      console.error(err);
      const msg = (err && err.message) || String(err);
      const isZipErr = /End of central directory|Corrupted zip|invalid signature/i.test(
        msg
      );
      setStatus(
        isZipErr
          ? "このファイルは .docx として読み込めませんでした。OOXML 形式の .docx を選んでください。"
          : "読み込みに失敗しました: " + msg,
        true
      );
      setFooter("エラー");
    }
  }

  function showPaper() {
    els.welcome.classList.add("hidden");
    els.paperWrap.classList.remove("hidden");
    els.workspace.scrollTop = 0;
  }

  function enableControls(enabled) {
    [
      els.zoomInBtn,
      els.zoomOutBtn,
      els.searchInput,
      els.searchPrevBtn,
      els.searchNextBtn,
    ].forEach((el) => (el.disabled = !enabled));
  }

  // ---------- ズーム ----------
  function setupZoom() {
    els.zoomInBtn.addEventListener("click", () => zoomStep(+1));
    els.zoomOutBtn.addEventListener("click", () => zoomStep(-1));

    // Ctrl + ホイールでズーム
    els.workspace.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        if (els.paperWrap.classList.contains("hidden")) return;
        e.preventDefault();
        zoomStep(e.deltaY < 0 ? +1 : -1);
      },
      { passive: false }
    );
  }

  function zoomStep(direction) {
    if (direction > 0) {
      const next = ZOOM_STEPS.find((z) => z > state.zoom + 0.0001);
      if (next) state.zoom = next;
    } else {
      const arr = [...ZOOM_STEPS].reverse();
      const next = arr.find((z) => z < state.zoom - 0.0001);
      if (next) state.zoom = next;
    }
    applyZoom();
  }

  function applyZoom() {
    els.paperScale.style.setProperty("--zoom", state.zoom.toFixed(3));
    els.zoomValue.textContent = Math.round(state.zoom * 100) + "%";
  }

  // ---------- 検索 ----------
  function setupSearch() {
    let timer = null;
    els.searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => runSearch(els.searchInput.value), 120);
    });
    els.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) gotoHit(state.search.activeIndex - 1);
        else gotoHit(state.search.activeIndex + 1);
      } else if (e.key === "Escape") {
        els.searchInput.value = "";
        runSearch("");
        els.searchInput.blur();
      }
    });
    els.searchNextBtn.addEventListener("click", () =>
      gotoHit(state.search.activeIndex + 1)
    );
    els.searchPrevBtn.addEventListener("click", () =>
      gotoHit(state.search.activeIndex - 1)
    );
  }

  function runSearch(query) {
    clearHighlights();
    state.search.query = query || "";
    state.search.hits = [];
    state.search.activeIndex = -1;

    if (!query || query.length < 1) {
      updateSearchCounter();
      return;
    }

    highlightInElement(els.paper, query);
    state.search.hits = Array.from(
      els.paper.querySelectorAll("mark.search-hit")
    );
    if (state.search.hits.length) gotoHit(0);
    updateSearchCounter();
  }

  function gotoHit(index) {
    if (!state.search.hits.length) return;
    const n = state.search.hits.length;
    const i = ((index % n) + n) % n;
    state.search.hits.forEach((m) => m.classList.remove("active"));
    const target = state.search.hits[i];
    target.classList.add("active");
    state.search.activeIndex = i;
    updateSearchCounter();

    // ズームに合わせてスクロール位置を補正
    const rect = target.getBoundingClientRect();
    const wsRect = els.workspace.getBoundingClientRect();
    const offset =
      els.workspace.scrollTop +
      (rect.top - wsRect.top) -
      els.workspace.clientHeight / 2 +
      rect.height / 2;
    els.workspace.scrollTo({ top: offset, behavior: "smooth" });
  }

  function updateSearchCounter() {
    const n = state.search.hits.length;
    const i = state.search.activeIndex;
    if (!state.search.query) {
      els.searchCounter.textContent = "";
    } else if (n === 0) {
      els.searchCounter.textContent = "0 件";
    } else {
      els.searchCounter.textContent = `${i + 1} / ${n}`;
    }
  }

  function clearHighlights() {
    const marks = els.paper.querySelectorAll("mark.search-hit");
    marks.forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }

  function highlightInElement(root, query) {
    if (!query) return;
    const lowerQ = query.toLowerCase();
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          // <script>/<style>/既存の mark 内はスキップ
          let p = node.parentNode;
          while (p && p !== root) {
            const tag = p.nodeName;
            if (tag === "SCRIPT" || tag === "STYLE") {
              return NodeFilter.FILTER_REJECT;
            }
            if (tag === "MARK" && p.classList.contains("search-hit")) {
              return NodeFilter.FILTER_REJECT;
            }
            p = p.parentNode;
          }
          return node.nodeValue.toLowerCase().includes(lowerQ)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
      false
    );

    const targets = [];
    let n = walker.nextNode();
    while (n) {
      targets.push(n);
      n = walker.nextNode();
    }

    for (const textNode of targets) {
      const text = textNode.nodeValue;
      const lower = text.toLowerCase();
      const frag = document.createDocumentFragment();
      let i = 0;
      while (i < text.length) {
        const idx = lower.indexOf(lowerQ, i);
        if (idx === -1) {
          frag.appendChild(document.createTextNode(text.slice(i)));
          break;
        }
        if (idx > i) {
          frag.appendChild(document.createTextNode(text.slice(i, idx)));
        }
        const mark = document.createElement("mark");
        mark.className = "search-hit";
        mark.textContent = text.slice(idx, idx + lowerQ.length);
        frag.appendChild(mark);
        i = idx + lowerQ.length;
      }
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  // ---------- ショートカット ----------
  function setupKeys() {
    document.addEventListener("keydown", (e) => {
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.key.toLowerCase() === "o") {
        e.preventDefault();
        els.fileInput.click();
      } else if (cmd && e.key.toLowerCase() === "f") {
        if (els.searchInput.disabled) return;
        e.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
      } else if (cmd && (e.key === "+" || e.key === "=")) {
        if (els.zoomInBtn.disabled) return;
        e.preventDefault();
        zoomStep(+1);
      } else if (cmd && e.key === "-") {
        if (els.zoomOutBtn.disabled) return;
        e.preventDefault();
        zoomStep(-1);
      } else if (cmd && e.key === "0") {
        if (els.zoomInBtn.disabled) return;
        e.preventDefault();
        state.zoom = 1;
        applyZoom();
      }
    });
  }

  // ---------- ステータス & フッター ----------
  function setupFooter() {
    setFooter("準備完了");
  }

  function setStatus(msg, isError) {
    if (!msg) {
      els.status.classList.add("hidden");
      els.status.textContent = "";
      els.status.classList.remove("error");
      return;
    }
    els.status.classList.remove("hidden");
    els.status.classList.toggle("error", !!isError);
    els.status.textContent = msg;
  }

  function setFooter(msg) {
    els.footStatus.textContent = msg;
  }

  // ---------- 補助 ----------
  function setupAnchors() {
    // mammoth が出力するリンクは新規タブで開く
    els.paper.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (/^https?:/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  function computeStats(text) {
    const chars = text.replace(/\s/g, "").length;
    const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
    return { chars, words };
  }

  function formatBytes(bytes) {
    if (bytes == null) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return (i === 0 ? n : n.toFixed(2)) + " " + units[i];
  }

})();
