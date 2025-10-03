#!/bin/bash
# Quick backup script
# Usage: ./run_backup.sh

echo "🚀 Supabase Backup Tool"
echo "======================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please copy .env.example to .env and configure it:"
    echo "  cp .env.example .env"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies if needed
if ! python -c "import supabase" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
fi

# Run the backup
echo ""
echo "🔄 Starting backup..."
python cli.py backup

echo ""
echo "✅ Done!"
