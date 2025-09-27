@echo off
echo Starting Gemini AI Chat Backend...
echo.
echo Make sure you have set your GEMINI_API_KEY environment variable:
echo set GEMINI_API_KEY=your_api_key_here
echo.

REM Check if virtual environment exists, if not create it
if not exist "gemini_env" (
    echo Creating virtual environment...
    python -m venv gemini_env
)

REM Activate virtual environment
echo Activating virtual environment...
call gemini_env\Scripts\activate

REM Install requirements
echo Installing requirements...
pip install -r gemini_requirements.txt

REM Start the backend
echo Starting Gemini backend on port 5000...
python gemini_chat_backend.py

pause