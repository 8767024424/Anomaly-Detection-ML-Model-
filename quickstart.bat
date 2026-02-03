@echo off
echo ==========================================
echo Industrial Pump Monitoring - Quick Start
echo ==========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.8+
    pause
    exit /b 1
)

echo OK Python found
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt --quiet

REM Check if .env exists
if not exist ".env" (
    echo WARNING: No .env file found. Creating from template...
    copy .env.example .env
    echo Please edit .env and add your Supabase credentials
    echo OR run without database in-memory mode
)

REM Check if model exists
if not exist "lstm_model.h5" (
    echo Training ML model first time only...
    python train_lstm_autoencoder.py
)

echo.
echo ==========================================
echo Setup Complete!
echo ==========================================
echo.
echo To start the dashboard:
echo   python app.py
echo.
echo Then open: http://localhost:5000
echo.
echo For the improved responsive version:
echo   http://localhost:5000/index-improved.html
echo.
echo ==========================================
pause
