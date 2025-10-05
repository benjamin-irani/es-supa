#!/bin/bash

# Launch Supabase Backup & Restore GUI

echo "🚀 Launching Supabase Backup & Restore GUI..."
echo ""

# Set PostgreSQL path
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# Launch GUI
python3 supabase_gui.py
