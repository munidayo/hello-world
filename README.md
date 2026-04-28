# docx 解凍アプリ

`.docx` ファイル（Microsoft Word の文書フォーマット）は、実は OOXML（Office Open XML）規格に基づく **ZIP アーカイブ** です。
このアプリは、ブラウザだけで `.docx` を解凍してその中身を覗き見できる、シンプルな静的 Web アプリです。

> ファイルはサーバーに送信されません。すべての処理はあなたのブラウザの中で完結します。

## 機能

- ドラッグ＆ドロップ または ファイル選択で `.docx`（や `.docm` / `.dotx` / `.zip`）を読み込み
- 中身のファイル一覧をツリー表示
- 各ファイルのプレビュー
  - XML / `.rels` ファイルは整形して表示
  - 画像（PNG/JPG/GIF/WEBP/BMP/SVG）はそのまま表示
  - その他テキストファイルもそのまま表示
- 個別ファイルのダウンロード、または全エントリを ZIP として再保存
- `word/document.xml` から本文テキストを抽出してコピー
- `docProps/core.xml` / `docProps/app.xml` からメタデータ（作成者、ページ数、単語数 等）を抽出して表示

## 使い方

ビルド不要・依存物のインストール不要。静的ファイルなので、好きな方法で開けます。

### 1. そのままブラウザで開く

```
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

### 2. 簡易サーバで開く（推奨）

ローカルファイル（`file://`）でも動きますが、念のため簡易サーバで配信したい場合：

```bash
# Python3 がある環境
python3 -m http.server 8000

# Node.js がある環境
npx serve .
```

そして `http://localhost:8000/` を開いてください。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | アプリ本体のマークアップ |
| `styles.css` | スタイル定義 |
| `app.js` | アプリのロジック（ZIP の解凍、ツリー構築、テキスト抽出など） |

## 依存ライブラリ

- [JSZip 3.10.1](https://stuk.github.io/jszip/) — ZIP 読み書き（CDN から読み込み）

## 仕組み（ざっくり）

1. ユーザーがアップロードした `.docx` を `ArrayBuffer` として読み込み、`JSZip.loadAsync()` で展開
2. ZIP のエントリ一覧をツリー構造に組み立てて UI に描画
3. 選択されたファイルを `entry.async("string"|"blob")` で取り出してプレビュー
4. 本文タブでは `word/document.xml` から `<w:p>` / `<w:t>` / `<w:br>` / `<w:tab>` を辿ってプレーンテキストを抽出
5. プロパティタブでは `docProps/core.xml` と `docProps/app.xml` を解析

## ライセンス

MIT
