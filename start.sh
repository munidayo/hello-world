#!/usr/bin/env bash
# DocxPeek 起動スクリプト (macOS / Linux)
# 使い方: ./start.sh   または   bash start.sh
# 環境変数 PORT で待ち受けポートを変更可能 (既定: 8000)

set -e
PORT="${PORT:-8000}"
URL="http://localhost:${PORT}/"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

cat <<EOF
┌──────────────────────────────────────────┐
│ 👀  DocxPeek                             │
│                                           │
│  $URL                                     │
│                                           │
│  停止するには Ctrl+C を押してください      │
└──────────────────────────────────────────┘
EOF

# ブラウザは少し遅らせて開く（サーバ起動を待つ）
open_browser() {
  sleep 1
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL"
  elif command -v wslview >/dev/null 2>&1; then
    wslview "$URL"
  fi
}

# 利用可能な静的サーバを順に探す
if command -v python3 >/dev/null 2>&1; then
  open_browser &
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  open_browser &
  exec python -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  open_browser &
  exec npx --yes serve -l "$PORT" .
elif command -v php >/dev/null 2>&1; then
  open_browser &
  exec php -S "localhost:${PORT}"
else
  echo "エラー: Python3 / Python / Node.js (npx) / PHP のいずれかが必要です。" >&2
  echo "        どれかひとつインストールしてから再実行してください。" >&2
  exit 1
fi
