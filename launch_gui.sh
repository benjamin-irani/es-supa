#!/bin/bash

# Launch Supabase Backup & Restore Web GUI

echo "🚀 Launching Supabase Backup & Restore Web GUI..."
echo ""

# Set PostgreSQL path
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# Check if Flask is installed
python3 -c "import flask" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📦 Installing Flask..."
    pip3 install flask
fi

# Launch Web GUI
python3 web_gui.py
