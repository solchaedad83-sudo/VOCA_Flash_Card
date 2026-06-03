#!/bin/zsh

cd "$(dirname "$0")" || exit 1

PORT=8000
URL="http://localhost:${PORT}"
LAN_IP="$(python3 - <<'PY'
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    print(s.getsockname()[0])
    s.close()
except Exception:
    print("localhost")
PY
)"
MOBILE_URL="http://${LAN_IP}:${PORT}/mobile.html"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3를 찾을 수 없습니다. Python 3를 설치한 뒤 다시 실행해주세요."
  read -r "?종료하려면 Enter를 누르세요."
  exit 1
fi

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "이미 서버가 실행 중입니다: ${URL}"
  open "${URL}"
  read -r "?종료하려면 Enter를 누르세요."
  exit 0
fi

echo "Anki VOCA 서버를 시작합니다."
echo "브라우저 주소: ${URL}"
echo "아이폰 주소: ${MOBILE_URL}"
echo "이 창을 닫거나 Control+C를 누르면 서버가 종료됩니다."
echo

( sleep 1; open "${URL}" ) &
python3 server.py
