#!/bin/bash
set -e
cd "$(dirname "$0")"

VENV="venv"
if [ ! -d "$VENV" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV"
fi

echo "Installing dependencies..."
"$VENV/bin/pip" install -q -r requirements.txt

echo "Starting server at http://0.0.0.0:50260"
echo "  Stream:  http://localhost:50260/stream"
echo "  Strimer: http://localhost:50260/start_stream"
"$VENV/bin/uvicorn" main:app --host 0.0.0.0 --port 50260
