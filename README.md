# 👀 DocxPeek

`.docx` ファイルを **ブラウザだけ** で開いて、紙面のようにちらっと覗き見できるシンプルなビューアです。

> "peek = ちらっと覗く"。書けないけど、読める。

編集機能はあえて持たず、**読むことに集中したミニマルなビューア**として作っています。
ファイルは外部送信されず、すべてブラウザ内で処理されます。

## 特徴

- 📄 docx → HTML 変換（[mammoth.js](https://github.com/mwilliamson/mammoth.js) 利用）で紙面のように表示
- 🖼️ 画像・表・見出し・箇条書き・引用などをそのまま再現
- 🔍 本文内のインクリメンタル検索（ヒット箇所をハイライト & ジャンプ）
- 🔎 ズームイン／アウト、`Ctrl + ホイール` でもズーム可
- 🌙 ライト／ダークテーマ切り替え（設定はローカルに保存）
- 🪟 ページ全体ドラッグ＆ドロップでファイルを開ける
- 🖥️ PWA としてインストール可能（タスクバー / Dock / スタートメニューから起動）
- ⌨️ キーボードショートカット
  - `Ctrl + O`: docx を開く
  - `Ctrl + F`: 検索
  - `Ctrl + ＋ / −`: ズームイン／アウト
  - `Ctrl + 0`: ズームを 100% に戻す

## ツールバー

最低限の 4 つだけ:

| ボタン | 機能 |
| --- | --- |
| 📂 開く | docx を選択 |
| ＋ − | ズーム |
| 🔍 検索 | 本文内検索（◀ ▶ で前後ジャンプ） |
| 🌙 ダーク | テーマ切替 |

## 使い方

ビルド不要・依存物のインストール不要です。

### 1. そのまま開く（お試し）

```
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

> PWA インストールやファイルハンドラ機能を使うときは **`http://` 経由でアクセス** する必要があります（次項参照）。

### 2. ローカルサーバで配信して PC にインストール（推奨）

```bash
# Python3 がある環境
python3 -m http.server 8000

# Node.js がある環境
npx serve .
```

そして `http://localhost:8000/` を開きます。

#### Chrome / Edge / Brave / Arc などの Chromium 系ブラウザ

1. アドレスバー右端の **「アプリをインストール」** アイコン（モニタに ↓ のマーク）をクリック
2. または、メニュー → **「アプリをインストール」 / 「DocxPeek をインストール」**
3. インストール後はタスクバー / Dock / スタートメニューから単独ウィンドウで起動できます

#### Safari (macOS / iOS)

- macOS 14+: メニュー → **「ファイル」 → 「Dock に追加」**
- iOS / iPadOS: 共有メニュー → **「ホーム画面に追加」**

#### .docx を「DocxPeek で開く」関連付け

Chromium 系では PWA インストール後、`.docx` ファイルを右クリック → **「プログラムから開く」 → DocxPeek** で関連付けできます（`manifest.webmanifest` の `file_handlers` 機能）。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | アプリのマークアップ |
| `styles.css` | UI と紙面のスタイル |
| `app.js` | docx の読み込み・描画・検索・ズーム・テーマのロジック |
| `manifest.webmanifest` | PWA 設定（インストール、ファイルハンドラ） |
| `icon.svg` | アプリアイコン |
| `icon-maskable.svg` | OS のアダプティブアイコン用（マスク対応） |

## 依存ライブラリ

- [mammoth.js 1.7.2](https://github.com/mwilliamson/mammoth.js) — `.docx` から HTML への変換（CDN から読み込み）

## 仕組み（ざっくり）

1. ユーザーがアップロードした `.docx` を `ArrayBuffer` で読み込み
2. `mammoth.convertToHtml({ arrayBuffer })` で HTML に変換
3. A4 サイズの `.paper` 要素に流し込み、CSS で紙面レイアウトを再現
4. ズームは紙面コンテナへの `transform: scale()` で実装
5. 検索は `TreeWalker` で本文を走査して `<mark class="search-hit">` を挿入

## 制限事項

Word の凝ったスタイル（複雑なレイアウト、テキストボックス、SmartArt、コメント、フォーム要素など）は再現できないか簡略化されます。Word の代替ではなく、**読むためのビューア** として作っています。

## ライセンス

MIT
