#!/usr/bin/env python3
"""
Compare tables between source and target databases
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def get_tables(db_url, name):
    """Get all tables from a database"""
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        # Get tables from public schema only
        cursor.execute("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        """)
        
        tables = [row[0] for row in cursor.fetchall()]
        
        cursor.close()
        conn.close()
        
        return tables
    except Exception as e:
        print(f"❌ Error connecting to {name}: {e}")
        return []

print("=" * 70)
print("🔍 Comparing Source and Target Databases")
print("=" * 70)

# Source database
source_db = os.getenv('SUPABASE_DB_URL')
if source_db and '@' in source_db:
    source_host = source_db.split('@')[1].split(':')[0]
    print(f"\n📊 Source Database: {source_host}")
else:
    print(f"\n📊 Source Database: (from .env)")
source_tables = get_tables(source_db, "source")
print(f"   Tables in public schema: {len(source_tables)}")

# Target database - always ask user
print("\n📋 Enter Target Database Details:")
print("   (Format: postgresql://postgres:PASSWORD@HOST:5432/postgres)")
target_db = input("   Target DB URL: ").strip()

if target_db:
    if '@' in target_db:
        target_host = target_db.split('@')[1].split(':')[0]
        print(f"\n📊 Target Database: {target_host}")
    else:
        print(f"\n📊 Target Database: (provided)")
    target_tables = get_tables(target_db, "target")
    print(f"   Tables in public schema: {len(target_tables)}")
    
    # Compare
    print("\n" + "=" * 70)
    print("📊 Comparison Results")
    print("=" * 70)
    
    source_set = set(source_tables)
    target_set = set(target_tables)
    
    missing_in_target = source_set - target_set
    extra_in_target = target_set - source_set
    
    if missing_in_target:
        print(f"\n❌ Missing in Target ({len(missing_in_target)} tables):")
        for table in sorted(missing_in_target):
            print(f"   - {table}")
    else:
        print(f"\n✅ No tables missing in target")
    
    if extra_in_target:
        print(f"\n⚠️  Extra in Target ({len(extra_in_target)} tables):")
        for table in sorted(extra_in_target):
            print(f"   - {table}")
    else:
        print(f"\n✅ No extra tables in target")
    
    if not missing_in_target and not extra_in_target:
        print(f"\n✅ Perfect match! Both have {len(source_tables)} tables")
    else:
        print(f"\n📊 Summary:")
        print(f"   Source: {len(source_tables)} tables")
        print(f"   Target: {len(target_tables)} tables")
        print(f"   Difference: {len(source_tables) - len(target_tables)} tables")

print("\n" + "=" * 70)
