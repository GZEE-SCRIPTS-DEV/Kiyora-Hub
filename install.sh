#!/bin/sh
# Instalador do kh (Kiyora Hub).
# Uso:  curl -fsSL https://kiyora-hub.pages.dev/install.sh | sh
set -e
URL="${KH_URL:-https://kiyora-hub.pages.dev}"
cd "$HOME"
PY=python3
command -v python3 >/dev/null 2>&1 || PY=python
if ! command -v "$PY" >/dev/null 2>&1; then
  if command -v pkg >/dev/null 2>&1; then
    echo "Instalando o Python (uma vez)..."
    pkg install -y python
    PY=python
  else
    echo "Instale o Python 3 e rode este comando de novo."
    exit 1
  fi
fi
curl -fsSL "$URL/kh.py" -o kh.py
"$PY" kh.py install
rm -f kh.py
echo
echo "Pronto! Agora entre na sua conta:  kh login"
