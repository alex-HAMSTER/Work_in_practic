@echo off


set VENV=.venv

if not exist %VENV% (
    echo Creating virtual environment...
    python -m venv %VENV%
)

echo Installing dependencies...
%VENV%\Scripts\pip install -r requirements.txt

echo Starting server at http://0.0.0.0:50260
echo   Stream:  http://localhost:50260/stream
echo   Strimer: http://localhost:50260/start_stream

%VENV%\Scripts\uvicorn main:app --host 0.0.0.0 --port 50260
pause

