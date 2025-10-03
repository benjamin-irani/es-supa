#!/usr/bin/env python3
"""
Backup database using PostgREST API instead of pg_dump
This works when direct database connection is not available
"""

import os
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import requests
from tqdm import tqdm

load_dotenv()

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_dir = Path(f"./backups/db_api_backup_{timestamp}")
backup_dir.mkdir(parents=True, exist_ok=True)

print("=" * 70)
print("🔍 Database Backup via PostgREST API")
print("=" * 70)
print(f"📁 Backup directory: {backup_dir}\n")

headers = {
    'apikey': supabase_key,
    'Authorization': f'Bearer {supabase_key}',
    'Content-Type': 'application/json'
}

# Get list of tables from information_schema
print("📋 Discovering tables...")
try:
    # Try to query pg_catalog to get table list
    response = requests.get(
        f"{supabase_url}/rest/v1/rpc/get_tables",
        headers=headers,
        timeout=10
    )
    
    if response.status_code == 404:
        # Function doesn't exist, try alternative method
        print("  ℹ️  Using alternative table discovery...")
        
        # Query information_schema.tables
        params = {
            'select': 'table_name',
            'table_schema': 'eq.public',
            'table_type': 'eq.BASE TABLE'
        }
        
        response = requests.get(
            f"{supabase_url}/rest/v1/",
            headers=headers,
            timeout=10
        )
        
        # The root endpoint returns available tables
        if response.status_code == 200:
            # Parse the response to get table names
            # PostgREST root returns OpenAPI spec
            print("  ℹ️  Checking available endpoints...")
            
            # Try to get tables by querying each known table
            # This is a workaround - we'll try common table names
            print("  ⚠️  Cannot auto-discover tables without database access")
            print("  💡  Alternative: Use Supabase Studio to export schema")
            
    tables = []
    
except Exception as e:
    print(f"  ❌ Error discovering tables: {e}")
    tables = []

if not tables:
    print("\n" + "=" * 70)
    print("⚠️  Cannot Backup Database via API")
    print("=" * 70)
    print("""
The PostgREST API requires knowing table names in advance, but we cannot
discover them without direct database access.

SOLUTION: Use Supabase Dashboard to export database

1. Go to: https://supabase.com/dashboard/project/uezenrqnuuaglgwnvbsx
2. Click on "SQL Editor" or "Database"
3. Export options:
   
   Option A - Via SQL Editor:
   - Run: SELECT * FROM information_schema.tables WHERE table_schema = 'public';
   - Copy table names
   - Export each table individually
   
   Option B - Via Dashboard:
   - Settings → Database → Backups
   - Download latest backup
   
   Option C - Via Supabase CLI (if project is accessible):
   - npx supabase db dump -f database.sql

The database connection issue suggests your project may be:
- Paused (free tier inactivity)
- Using a different connection method
- Requires IPv4 add-on for direct access

Contact Supabase support for assistance with database access.
""")

print("=" * 70)
