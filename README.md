# Mini Word — ローカル docx ビューア

`.docx` ファイルを **ブラウザだけ** で開いて、Word のように紙面で読めるシンプルな静的 Web アプリです。

> ファイルはサーバーに送信されません。すべての処理はあなたのブラウザの中で完結します。

編集機能はあえて持たず、**読むことに集中したミニマルなビューア**です。
ツールバーは「開く・ズーム・検索・ダーク切替」だけ。

## 特徴

- 📄 docx → HTML 変換（[mammoth.js](https://github.com/mwilliamson/mammoth.js) 利用）
- 🖼️ 画像・表・見出し・箇条書き・引用などをそのまま再現
- 🔍 本文内のインクリメンタル検索（ヒット箇所をハイライト & ジャンプ）
- 🔎 ズームイン／アウト、`Ctrl + ホイール` でもズーム可
- 🌙 ライト／ダークテーマ切り替え（設定はローカルに保存）
- ⌨️ キーボードショートカット
  - `Ctrl + O`: docx を開く
  - `Ctrl + F`: 検索
  - `Ctrl + ＋ / −`: ズームイン／アウト
  - `Ctrl + 0`: ズームを 100% に戻す

## 使い方

ビルド不要・依存物のインストール不要です。

### 1. そのままブラウザで開く

```
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

### 2. 簡易サーバで開く（推奨）

```bash
# Python3 がある環境
python3 -m http.server 8000

# Node.js がある環境
npx serve .
```

そして `http://localhost:8000/` を開いて、`.docx` ファイルをドラッグ＆ドロップしてください。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | アプリのマークアップ |
| `styles.css` | Word 風 UI と紙面のスタイル |
| `app.js` | docx の読み込み・描画・検索・ズーム・印刷ロジック |

## 依存ライブラリ

- [mammoth.js 1.7.2](https://github.com/mwilliamson/mammoth.js) — `.docx` から HTML への変換（CDN から読み込み）

## 対応している docx 要素（mammoth の既定マッピングに依存）

- 段落、見出し（`Heading 1`〜`Heading 6`）
- 太字 / 斜体 / 下線 / 取り消し線 / 上付き・下付き
- 箇条書き / 番号付きリスト
- 表（簡易レンダリング）
- ハイパーリンク（外部リンクは新規タブで開きます）
- 埋め込み画像（mammoth が base64 化して `<img>` に変換）
- 引用ブロック

> Word の凝ったスタイル（複雑なレイアウト、テキストボックス、SmartArt、コメント、フォーム要素など）は再現できないか、簡略化されます。Word の代替ではなく **読むためのビューア** として作られています。

## 仕組み（ざっくり）

1. ユーザーがアップロードした `.docx` を `ArrayBuffer` で読み込み
2. `mammoth.convertToHtml({ arrayBuffer })` で HTML に変換
3. A4 サイズの `.paper` 要素にそのまま流し込み、CSS で紙面レイアウトを再現
4. 検索は `TreeWalker` で本文を走査して `<mark>` を挿入
5. ズームは紙面コンテナへの `transform: scale()` で実装

## ライセンス

MIT
