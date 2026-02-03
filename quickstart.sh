#!/bin/bash

echo "=========================================="
echo "Industrial Pump Monitoring - Quick Start"
echo "=========================================="
echo ""

# Check Python
if ! command -v python &> /dev/null; then
    echo "❌ Python not found. Please install Python 3.8+"
    exit 1
fi

echo "✅ Python found: $(python --version)"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate || source venv/Scripts/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt --quiet

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit .env and add your Supabase credentials"
    echo "   OR run without database (in-memory mode)"
fi

# Check if model exists
if [ ! -f "lstm_model.h5" ]; then
    echo "🤖 Training ML model (first time only)..."
    python train_lstm_autoencoder.py
fi

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "To start the dashboard:"
echo "  python app.py"
echo ""
echo "Then open: http://localhost:5000"
echo ""
echo "For the improved responsive version:"
echo "  http://localhost:5000/index-improved.html"
echo ""
echo "=========================================="
