/* docx 解凍アプリ
 *
 * .docx は OOXML（ZIP）アーカイブなので、JSZip でブラウザ内だけで解凍できる。
 * このファイルは UI とファイルツリーの構築、プレビュー、テキスト抽出、
 * メタデータ抽出を担当する。
 */

(function () {
  "use strict";

  const els = {
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("fileInput"),
    pickBtn: document.getElementById("pickBtn"),
    status: document.getElementById("status"),
    result: document.getElementById("result"),
    fileName: document.getElementById("fileName"),
    fileMeta: document.getElementById("fileMeta"),
    copyTextBtn: document.getElementById("copyTextBtn"),
    downloadAllBtn: document.getElementById("downloadAllBtn"),
    resetBtn: document.getElementById("resetBtn"),
    tabs: document.querySelectorAll(".tab"),
    panels: {
      files: document.getElementById("panel-files"),
      text: document.getElementById("panel-text"),
      meta: document.getElementById("panel-meta"),
    },
    tree: document.getElementById("tree"),
    preview: document.getElementById("preview"),
    previewName: document.getElementById("previewName"),
    downloadOneBtn: document.getElementById("downloadOneBtn"),
    bodyText: document.getElementById("bodyText"),
    metaTable: document.querySelector("#metaTable tbody"),
  };

  /** 現在開いているアーカイブの状態 */
  const state = {
    zip: null,
    fileName: "",
    fileSize: 0,
    entries: [],
    selectedPath: null,
  };

  // ---------- ドラッグ＆ドロップ ----------
  ["dragenter", "dragover"].forEach((evt) => {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    els.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.dropzone.classList.remove("dragging");
    });
  });

  els.dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  els.dropzone.addEventListener("click", (e) => {
    if (e.target === els.pickBtn) return;
    els.fileInput.click();
  });

  els.pickBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.fileInput.click();
  });

  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (file) handleFile(file);
    els.fileInput.value = "";
  });

  els.resetBtn.addEventListener("click", () => {
    state.zip = null;
    state.entries = [];
    state.selectedPath = null;
    els.result.classList.add("hidden");
    setStatus("");
  });

  els.downloadAllBtn.addEventListener("click", async () => {
    if (!state.zip) return;
    setStatus("ZIP を再パッケージしています…");
    try {
      const blob = await state.zip.generateAsync({ type: "blob" });
      const baseName = state.fileName.replace(/\.[^.]+$/, "") || "document";
      triggerDownload(blob, baseName + "-extracted.zip");
      setStatus("");
    } catch (err) {
      setStatus("ZIP の生成に失敗しました: " + err.message, true);
    }
  });

  els.copyTextBtn.addEventListener("click", async () => {
    const text = els.bodyText.textContent || "";
    if (!text) {
      setStatus("コピーできるテキストがありません", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("本文テキストをクリップボードにコピーしました");
      setTimeout(() => setStatus(""), 1500);
    } catch (err) {
      setStatus("コピーに失敗しました: " + err.message, true);
    }
  });

  // ---------- タブ切り替え ----------
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      els.tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      Object.entries(els.panels).forEach(([key, panel]) => {
        const active = key === target;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    });
  });

  // ---------- メイン処理 ----------
  async function handleFile(file) {
    setStatus(`「${file.name}」を読み込んでいます…`);
    try {
      const buf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      state.zip = zip;
      state.fileName = file.name;
      state.fileSize = file.size;
      state.entries = collectEntries(zip);
      state.selectedPath = null;

      els.fileName.textContent = file.name;
      els.fileMeta.textContent = formatHeaderMeta(file, state.entries);

      buildTree(state.entries);
      resetPreview();
      await renderBodyText(zip);
      await renderMeta(zip, file);

      els.result.classList.remove("hidden");
      setStatus("");
      autoSelectInteresting();
    } catch (err) {
      console.error(err);
      const isZipErr =
        /End of central directory|invalid signature|Corrupted zip|Can't find end of central directory/i.test(
          err.message || ""
        );
      setStatus(
        isZipErr
          ? "このファイルは ZIP として読み込めませんでした。.docx ファイルを選択してください。"
          : "読み込みに失敗しました: " + (err.message || err),
        true
      );
    }
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

  function formatHeaderMeta(file, entries) {
    const totalUncompressed = entries.reduce(
      (sum, e) => sum + (e.uncompressedSize || 0),
      0
    );
    return [
      formatBytes(file.size) + " (圧縮)",
      formatBytes(totalUncompressed) + " (展開)",
      entries.length + " エントリ",
    ].join(" · ");
  }

  function collectEntries(zip) {
    const entries = [];
    zip.forEach((relativePath, entry) => {
      entries.push({
        path: entry.name,
        dir: entry.dir,
        uncompressedSize:
          (entry._data && entry._data.uncompressedSize) || 0,
        compressedSize:
          (entry._data && entry._data.compressedSize) || 0,
        date: entry.date,
        entry,
      });
    });
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return entries;
  }

  // ---------- ツリー ----------
  function buildTree(entries) {
    els.tree.innerHTML = "";
    const root = { name: "", children: new Map(), dir: true, path: "" };

    for (const e of entries) {
      const parts = e.path.split("/").filter(Boolean);
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        if (!node.children.has(part)) {
          node.children.set(part, {
            name: part,
            children: new Map(),
            dir: !isLast || e.dir,
            path: parts.slice(0, i + 1).join("/") + (!isLast || e.dir ? "/" : ""),
            entry: isLast && !e.dir ? e : null,
          });
        }
        node = node.children.get(part);
        if (isLast && !e.dir) node.entry = e;
      }
    }

    const frag = document.createDocumentFragment();
    renderTreeChildren(root, frag, 0);
    els.tree.appendChild(frag);
  }

  function renderTreeChildren(node, parentEl, depth) {
    const children = Array.from(node.children.values()).sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of children) {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "node";
      row.dataset.path = child.path;

      const twisty = document.createElement("span");
      twisty.className = "twisty";
      const icon = document.createElement("span");
      icon.className = "icon";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = child.name;
      const size = document.createElement("span");
      size.className = "size";

      if (child.dir) {
        twisty.textContent = "▾";
        icon.textContent = "📁";
      } else {
        twisty.textContent = "";
        icon.textContent = iconForFile(child.name);
        if (child.entry) size.textContent = formatBytes(child.entry.uncompressedSize);
      }

      row.appendChild(twisty);
      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(size);
      li.appendChild(row);

      if (child.dir) {
        const ul = document.createElement("ul");
        renderTreeChildren(child, ul, depth + 1);
        li.appendChild(ul);
        row.addEventListener("click", () => {
          const collapsed = ul.style.display === "none";
          ul.style.display = collapsed ? "" : "none";
          twisty.textContent = collapsed ? "▾" : "▸";
        });
      } else {
        row.addEventListener("click", () => {
          selectFile(child.entry, row);
        });
      }

      parentEl.appendChild(li);
    }
  }

  function iconForFile(name) {
    const ext = (name.match(/\.([^.]+)$/) || ["", ""])[1].toLowerCase();
    if (["xml", "rels"].includes(ext)) return "🧾";
    if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext))
      return "🖼️";
    if (["txt", "json", "html", "htm", "css", "js"].includes(ext)) return "📄";
    if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "🔤";
    return "📦";
  }

  // ---------- プレビュー ----------
  function resetPreview() {
    els.preview.innerHTML =
      '<p class="placeholder">左側のツリーからファイルを選ぶと、ここに内容を表示します。</p>';
    els.previewName.textContent = "ファイルを選択してください";
    els.downloadOneBtn.disabled = true;
    els.downloadOneBtn.onclick = null;
  }

  async function selectFile(entryInfo, rowEl) {
    if (!entryInfo) return;
    document
      .querySelectorAll(".tree .node.selected")
      .forEach((n) => n.classList.remove("selected"));
    if (rowEl) rowEl.classList.add("selected");
    state.selectedPath = entryInfo.path;

    els.previewName.textContent = entryInfo.path;
    els.preview.innerHTML = '<p class="placeholder">読み込み中…</p>';

    const ext = (entryInfo.path.match(/\.([^.]+)$/) || ["", ""])[1].toLowerCase();
    try {
      if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext)) {
        const blob = await entryInfo.entry.async("blob");
        const url = URL.createObjectURL(blob);
        els.preview.innerHTML = "";
        const img = document.createElement("img");
        img.src = url;
        img.alt = entryInfo.path;
        img.onload = () => URL.revokeObjectURL(url);
        els.preview.appendChild(img);
      } else if (ext === "svg") {
        const text = await entryInfo.entry.async("string");
        els.preview.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.innerHTML = text;
        els.preview.appendChild(wrap);
      } else {
        let text = await entryInfo.entry.async("string");
        if (ext === "xml" || ext === "rels") {
          text = prettyPrintXml(text);
        }
        els.preview.innerHTML = "";
        const pre = document.createElement("pre");
        pre.textContent = text;
        els.preview.appendChild(pre);
      }

      els.downloadOneBtn.disabled = false;
      els.downloadOneBtn.onclick = async () => {
        const blob = await entryInfo.entry.async("blob");
        const baseName = entryInfo.path.split("/").pop() || "file";
        triggerDownload(blob, baseName);
      };
    } catch (err) {
      els.preview.innerHTML =
        '<p class="placeholder">プレビューを表示できませんでした: ' +
        escapeHtml(err.message || String(err)) +
        "</p>";
    }
  }

  function autoSelectInteresting() {
    const preferred = [
      "word/document.xml",
      "ppt/presentation.xml",
      "xl/workbook.xml",
    ];
    for (const p of preferred) {
      const found = state.entries.find((e) => e.path === p);
      if (found) {
        const row = els.tree.querySelector(`.node[data-path="${cssEscape(p)}"]`);
        selectFile(found, row);
        return;
      }
    }
  }

  // ---------- 本文テキスト抽出 ----------
  async function renderBodyText(zip) {
    els.bodyText.textContent = "";
    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      els.bodyText.textContent =
        "(word/document.xml が見つかりませんでした。docx ではない可能性があります。)";
      return;
    }
    try {
      const xml = await docFile.async("string");
      els.bodyText.textContent = extractDocxBodyText(xml);
    } catch (err) {
      els.bodyText.textContent = "本文の抽出に失敗しました: " + err.message;
    }
  }

  /** docx の document.xml から段落／改行を保ったプレーンテキストを抽出 */
  function extractDocxBodyText(xml) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(xml, "application/xml");
    } catch (e) {
      return xml.replace(/<[^>]+>/g, "");
    }
    if (doc.getElementsByTagName("parsererror").length) {
      return xml.replace(/<[^>]+>/g, "");
    }

    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const lines = [];

    const paragraphs = doc.getElementsByTagNameNS(W, "p");
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      let line = "";
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_ELEMENT, null);
      let node = walker.currentNode;
      while (node) {
        if (node.namespaceURI === W) {
          const ln = node.localName;
          if (ln === "t") {
            line += node.textContent;
          } else if (ln === "tab") {
            line += "\t";
          } else if (ln === "br") {
            line += "\n";
          }
        }
        node = walker.nextNode();
      }
      lines.push(line);
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---------- メタ情報 ----------
  async function renderMeta(zip, file) {
    els.metaTable.innerHTML = "";
    addMetaRow("ファイル名", file.name);
    addMetaRow("サイズ (圧縮)", formatBytes(file.size));
    addMetaRow(
      "サイズ (展開)",
      formatBytes(state.entries.reduce((s, e) => s + (e.uncompressedSize || 0), 0))
    );
    addMetaRow("エントリ数", String(state.entries.length));
    addMetaRow("最終更新日時 (アップロード)", new Date(file.lastModified).toLocaleString());

    const corePath = "docProps/core.xml";
    const appPath = "docProps/app.xml";
    const coreFile = zip.file(corePath);
    const appFile = zip.file(appPath);

    if (coreFile) {
      try {
        const xml = await coreFile.async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const get = (ns, name) => {
          const el = doc.getElementsByTagNameNS(ns, name)[0];
          return el ? el.textContent : null;
        };
        const DC = "http://purl.org/dc/elements/1.1/";
        const CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
        const DCTERMS = "http://purl.org/dc/terms/";
        const map = [
          ["タイトル", get(DC, "title")],
          ["主題", get(DC, "subject")],
          ["作成者", get(DC, "creator")],
          ["最終更新者", get(CP, "lastModifiedBy")],
          ["キーワード", get(CP, "keywords")],
          ["説明", get(DC, "description")],
          ["カテゴリ", get(CP, "category")],
          ["改訂番号", get(CP, "revision")],
          ["作成日時", get(DCTERMS, "created")],
          ["更新日時", get(DCTERMS, "modified")],
        ];
        for (const [k, v] of map) {
          if (v) addMetaRow(k, v);
        }
      } catch (e) {
        // ignore
      }
    }

    if (appFile) {
      try {
        const xml = await appFile.async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const getAny = (name) => {
          const els = doc.getElementsByTagName(name);
          if (els.length) return els[0].textContent;
          const elsLocal = Array.from(doc.getElementsByTagName("*")).find(
            (e) => e.localName === name
          );
          return elsLocal ? elsLocal.textContent : null;
        };
        const fields = [
          ["アプリケーション", "Application"],
          ["バージョン", "AppVersion"],
          ["会社", "Company"],
          ["ページ数", "Pages"],
          ["単語数", "Words"],
          ["文字数", "Characters"],
          ["段落数", "Paragraphs"],
          ["行数", "Lines"],
          ["編集時間 (分)", "TotalTime"],
        ];
        for (const [label, tag] of fields) {
          const v = getAny(tag);
          if (v) addMetaRow(label, v);
        }
      } catch (e) {
        // ignore
      }
    }

    if (!els.metaTable.children.length) {
      addMetaRow("情報", "プロパティ情報は見つかりませんでした。");
    }
  }

  function addMetaRow(key, value) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    const td2 = document.createElement("td");
    td1.textContent = key;
    td2.textContent = value;
    tr.appendChild(td1);
    tr.appendChild(td2);
    els.metaTable.appendChild(tr);
  }

  // ---------- ユーティリティ ----------
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return (i === 0 ? n : n.toFixed(2)) + " " + units[i];
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return s.replace(/(["\\])/g, "\\$1");
  }

  function prettyPrintXml(xml) {
    let formatted = "";
    const reg = /(>)(<)(\/*)/g;
    const trimmed = xml.replace(reg, "$1\n$2$3").trim();
    let pad = 0;
    trimmed.split("\n").forEach((node) => {
      let indent = 0;
      if (/^<\/\w/.test(node)) {
        if (pad > 0) pad -= 1;
      } else if (/^<\w[^>]*[^/]>$/.test(node) && !/<\/\w/.test(node)) {
        indent = 1;
      }
      formatted += "  ".repeat(pad) + node + "\n";
      pad += indent;
    });
    return formatted.trim();
  }
})();
