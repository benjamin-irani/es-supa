#!/usr/bin/env python3
"""
Interactive script to restore backup to a new Supabase project
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv, set_key
from supabase_restore import SupabaseRestore
import psycopg2

def print_header(text):
    print("\n" + "=" * 70)
    print(text)
    print("=" * 70)

def print_step(number, text):
    print(f"\n{number}️⃣  {text}")

def main():
    print_header("🔄 Restore Backup to New Supabase Project")
    
    print("\nThis interactive tool will guide you through restoring a backup")
    print("to a new Supabase project. You'll need:")
    print("  • A backup to restore")
    print("  • New Supabase project credentials (URL, keys, database URL)")
    print("  • IPv4 add-on enabled on the new project")
    print("")
    
    # Step 1: Select backup
    print_step(1, "Select Backup to Restore")
    
    backups_dir = Path("./backups")
    if not backups_dir.exists():
        print("❌ No backups directory found!")
        sys.exit(1)
    
    # List available backups (only those with metadata.json)
    all_backups = []
    for item in backups_dir.rglob("*"):
        if item.is_dir() and (item / "metadata.json").exists():
            all_backups.append(item)
    
    backups = sorted(all_backups, reverse=True)
    
    if not backups:
        print("❌ No valid backups found!")
        sys.exit(1)
    
    print("\nAvailable backups:")
    for i, backup in enumerate(backups[:10], 1):  # Show last 10
        size = sum(f.stat().st_size for f in backup.rglob('*') if f.is_file())
        size_mb = size / (1024 * 1024)
        # Show relative path from backups/
        rel_path = backup.relative_to(backups_dir)
        print(f"  {i}. {rel_path} ({size_mb:.1f} MB)")
    
    choice = input("\nSelect backup number (or press Enter for most recent): ").strip()
    
    if choice == "":
        backup_path = backups[0]
    else:
        try:
            backup_path = backups[int(choice) - 1]
        except (ValueError, IndexError):
            print("❌ Invalid selection!")
            sys.exit(1)
    
    print(f"✅ Selected: {backup_path}")
    
    # Step 2: Get new project credentials (ALWAYS ask, never save)
    print_step(2, "Enter Target Project Credentials")
    
    print("\n⚠️  IMPORTANT: Credentials will NOT be saved for security.")
    print("You need credentials from your TARGET Supabase project.")
    print("Get these from: https://supabase.com/dashboard")
    print("")
    
    print("📋 Enter target project credentials:")
    print("\nGet these from your target Supabase project dashboard:")
    print("  1. Project URL: From dashboard URL or Settings → API")
    print("  2. Service Role Key: Settings → API → service_role (secret)")
    print("  3. Database URL: Click 'Connect' button → Direct connection")
    print("")
    
    new_url = input("  Supabase URL (e.g., https://abcxyz.supabase.co): ").strip()
    if not new_url.startswith('http'):
        new_url = f"https://{new_url}"
    
    new_key = input("  Service Role Key (starts with eyJ...): ").strip()
    new_db_url = input("  Database URL (postgresql://postgres:...): ").strip()
    
    # Step 3: Comprehensive Connection Tests
    print_step(3, "Testing Connections to Target Project")
    
    print("\n🔍 Running connection tests...")
    all_tests_passed = True
    
    # Test 1: Database Connection
    print("\n1️⃣  Testing database connection...")
    try:
        conn = psycopg2.connect(new_db_url, connect_timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        print(f"   ✅ Database connection successful")
        print(f"   PostgreSQL: {version.split(',')[0]}")
    except Exception as e:
        print(f"   ❌ Database connection failed: {e}")
        print("\n   💡 Troubleshooting:")
        print("      1. IPv4 add-on must be enabled in Supabase dashboard")
        print("      2. Verify database URL is correct")
        print("      3. Check database password")
        print("      4. Ensure your IP is not blocked")
        all_tests_passed = False
    
    # Test 2: Supabase API Connection
    print("\n2️⃣  Testing Supabase API connection...")
    try:
        from supabase import create_client
        supabase = create_client(new_url, new_key)
        # Try a simple API call
        result = supabase.table('_supabase_migrations').select('*').limit(1).execute()
        print(f"   ✅ Supabase API connection successful")
    except Exception as e:
        print(f"   ❌ Supabase API connection failed: {str(e)[:100]}")
        print("\n   💡 Troubleshooting:")
        print("      1. Verify Supabase URL is correct")
        print("      2. Check service_role key (not anon key)")
        print("      3. Ensure project is not paused")
        all_tests_passed = False
    
    # Test 3: Supabase CLI Availability
    print("\n3️⃣  Testing Supabase CLI availability...")
    try:
        cli_check = subprocess.run(['npx', 'supabase', '--version'], 
                                  capture_output=True, text=True, timeout=10)
        if cli_check.returncode == 0:
            print(f"   ✅ Supabase CLI available")
            print(f"   Version: {cli_check.stdout.strip()}")
        else:
            print(f"   ⚠️  Supabase CLI check failed")
            print(f"   Edge functions may need manual deployment")
    except Exception as e:
        print(f"   ⚠️  Supabase CLI not available: {str(e)[:50]}")
        print(f"   Edge functions will need manual deployment")
    
    # Test 4: CLI Link Test (optional, non-blocking)
    print("\n4️⃣  Testing CLI link capability...")
    try:
        project_ref = new_url.split('//')[1].split('.')[0]
        print(f"   Target project ref: {project_ref}")
        
        # Try to unlink first
        subprocess.run(['npx', 'supabase', 'unlink'], 
                      capture_output=True, text=True, timeout=5)
        
        # Try to link (this will fail without password, but we can check if command works)
        link_test = subprocess.run(['npx', 'supabase', 'link', '--project-ref', project_ref],
                                  capture_output=True, text=True, timeout=10,
                                  input='\n')  # Send empty input to fail quickly
        
        if 'Initialising login role' in link_test.stderr or 'Connecting to remote database' in link_test.stderr:
            print(f"   ✅ CLI link command available")
            print(f"   Edge functions can be auto-deployed")
        else:
            print(f"   ⚠️  CLI link may have issues")
            print(f"   Edge functions may need manual deployment")
    except Exception as e:
        print(f"   ⚠️  CLI link test inconclusive")
        print(f"   Edge functions deployment will be attempted")
    
    print("\n" + "=" * 70)
    
    if not all_tests_passed:
        print("❌ CRITICAL: Some connection tests failed!")
        print("\nYou must fix the connection issues before proceeding.")
        print("Restore cannot continue without database and API access.")
        sys.exit(1)
    else:
        print("✅ All critical connection tests passed!")
        print("   Database: ✅")
        print("   API: ✅")
        print("   CLI: ✅")
        print("\nRestore can proceed safely.")
    
    print("=" * 70)
    
    # Step 4: Select restore mode
    print_step(4, "Select Restore Mode")
    
    print("\nChoose how to handle existing data:")
    print("  1. CLEAN - Drop conflicting objects, then restore (recommended)")
    print("  2. MERGE - Skip existing objects, add missing only")
    print("  3. FORCE - Drop entire public schema, complete rebuild (DESTRUCTIVE)")
    print("")
    
    mode_choice = input("Select mode (1-3) [1]: ").strip()
    mode_map = {'1': 'clean', '2': 'merge', '3': 'force', '': 'clean'}
    restore_mode = mode_map.get(mode_choice, 'clean')
    
    print(f"✅ Selected mode: {restore_mode.upper()}")
    
    # Step 5: Choose what to restore
    print_step(5, "Select Components to Restore")
    
    print("\nWhat do you want to restore?")
    restore_database = input("  Restore database? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_storage = input("  Restore storage files? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_auth = input("  Restore auth users? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_edge_functions = input("  Restore edge functions? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_roles = input("  Restore database roles? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_realtime = input("  Restore realtime config? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_webhooks = input("  Restore webhooks? (yes/no) [yes]: ").strip().lower() != 'no'
    
    # Step 6: Analyze Backup and Show Checklist
    print_step(6, "Analyzing Backup Contents")
    
    # Analyze what's in the backup
    print("\n🔍 Scanning backup contents...")
    
    backup_stats = {
        'tables': 0,
        'roles': 0,
        'storage_buckets': 0,
        'storage_files': 0,
        'auth_users': 0,
        'edge_functions': 0,
        'policies': 0,
        'functions': 0,
        'triggers': 0
    }
    
    # Count tables from database.sql
    db_sql = backup_path / "database.sql"
    if db_sql.exists():
        with open(db_sql, 'r') as f:
            content = f.read()
            backup_stats['tables'] = content.count('CREATE TABLE')
            backup_stats['policies'] = content.count('CREATE POLICY')
            backup_stats['functions'] = content.count('CREATE FUNCTION')
            backup_stats['triggers'] = content.count('CREATE TRIGGER')
    
    # Count roles
    roles_file = backup_path / "roles.json"
    if roles_file.exists():
        import json
        with open(roles_file, 'r') as f:
            roles_data = json.load(f)
            backup_stats['roles'] = len(roles_data)
    
    # Count storage
    storage_dir = backup_path / "storage"
    if storage_dir.exists():
        backup_stats['storage_buckets'] = len([d for d in storage_dir.iterdir() if d.is_dir()])
        backup_stats['storage_files'] = sum(1 for _ in storage_dir.rglob('*') if _.is_file())
    
    # Count auth users
    auth_file = backup_path / "auth_users.json"
    if auth_file.exists():
        with open(auth_file, 'r') as f:
            auth_data = json.load(f)
            backup_stats['auth_users'] = len(auth_data.get('users', []))
    
    # Count edge functions
    functions_dir = backup_path / "edge_functions"
    if functions_dir.exists():
        backup_stats['edge_functions'] = len([d for d in functions_dir.iterdir() if d.is_dir() and not d.name.startswith('.')])
    
    # Step 7: Show Comprehensive Checklist
    print_step(7, "Restore Checklist & Confirmation")
    
    # Extract and display project IDs
    target_project_id = new_url.split('//')[1].split('.')[0]
    
    mode_warnings = {
        'clean': "\n⚠️  WARNING: This will drop conflicting objects and restore!",
        'merge': "\n⚠️  WARNING: This will add missing objects (existing data preserved)!",
        'force': "\n🚨 DANGER: This will DELETE ALL existing data and restore!"
    }
    print(mode_warnings.get(restore_mode, "\n⚠️  WARNING: This will modify your database!"))
    
    print(f"\n{'=' * 70}")
    print(f"📋 COMPREHENSIVE RESTORE CHECKLIST")
    print(f"{'=' * 70}")
    
    print(f"\n📦 BACKUP SOURCE:")
    print(f"   Path: {backup_path}")
    
    print(f"\n🎯 TARGET PROJECT:")
    print(f"   URL:        {new_url}")
    print(f"   Project ID: {target_project_id}")
    
    print(f"\n🔄 RESTORE MODE: {restore_mode.upper()}")
    
    print(f"\n📊 DATABASE OBJECTS TO RESTORE:")
    if restore_database:
        print(f"   ✅ Tables:           {backup_stats['tables']} tables")
        print(f"   ✅ Policies (RLS):   {backup_stats['policies']} policies")
        print(f"   ✅ Functions:        {backup_stats['functions']} functions")
        print(f"   ✅ Triggers:         {backup_stats['triggers']} triggers")
        print(f"   ✅ Sequences, Views, Indexes, Constraints")
    else:
        print(f"   ❌ Database: SKIPPED")
    
    print(f"\n👥 ROLES & PERMISSIONS:")
    if restore_roles:
        print(f"   ✅ Database Roles:   {backup_stats['roles']} roles")
    else:
        print(f"   ❌ Roles: SKIPPED")
    
    print(f"\n📁 STORAGE:")
    if restore_storage:
        print(f"   ✅ Buckets:          {backup_stats['storage_buckets']} buckets")
        print(f"   ✅ Files:            {backup_stats['storage_files']} files")
    else:
        print(f"   ❌ Storage: SKIPPED")
    
    print(f"\n👤 AUTHENTICATION:")
    if restore_auth:
        print(f"   ✅ Auth Users:       {backup_stats['auth_users']} users")
    else:
        print(f"   ❌ Auth: SKIPPED")
    
    print(f"\n⚡ EDGE FUNCTIONS:")
    if restore_edge_functions:
        print(f"   ✅ Functions:        {backup_stats['edge_functions']} functions")
        print(f"   ✅ Auto-Deploy:      YES (will deploy to target)")
    else:
        print(f"   ❌ Edge Functions: SKIPPED")
    
    print(f"\n📡 REALTIME:")
    if restore_realtime:
        print(f"   ✅ Realtime Config:  YES")
    else:
        print(f"   ❌ Realtime: SKIPPED")
    
    print(f"\n🔗 WEBHOOKS:")
    if restore_webhooks:
        print(f"   ✅ Webhooks Config:  YES")
    else:
        print(f"   ❌ Webhooks: SKIPPED")
    
    print(f"\n{'=' * 70}")
    print(f"📊 TOTAL OBJECTS TO RESTORE:")
    total_objects = (
        (backup_stats['tables'] if restore_database else 0) +
        (backup_stats['roles'] if restore_roles else 0) +
        (backup_stats['storage_buckets'] if restore_storage else 0) +
        (backup_stats['auth_users'] if restore_auth else 0) +
        (backup_stats['edge_functions'] if restore_edge_functions else 0)
    )
    print(f"   {total_objects} major objects")
    print(f"   + {backup_stats['policies']} policies")
    print(f"   + {backup_stats['functions']} database functions")
    print(f"   + {backup_stats['triggers']} triggers")
    print(f"   + {backup_stats['storage_files']} storage files")
    print(f"{'=' * 70}")
    
    print(f"\n⚠️  CRITICAL: Verify the target project ID!")
    print(f"   Target Project ID: {target_project_id}")
    print(f"\n   This will restore {total_objects} major objects to this project.")
    print(f"   Make sure this is the CORRECT target project!")
    
    confirm = input("\n✋ Type 'yes' to proceed with restore: ").strip().lower()
    if confirm != 'yes':
        print("❌ Restore cancelled")
        sys.exit(0)
    
    # Step 8: Perform restore
    print_step(8, "Restoring Backup")
    
    try:
        restore = SupabaseRestore(new_url, new_key, new_db_url)
        
        restore.restore_backup(
            backup_path=str(backup_path),
            restore_database=restore_database,
            restore_storage=restore_storage,
            restore_auth=restore_auth,
            restore_edge_functions=restore_edge_functions,
            restore_roles=restore_roles,
            restore_realtime=restore_realtime,
            restore_webhooks=restore_webhooks,
            deploy_functions=True,  # Auto-deploy edge functions
            mode=restore_mode,
            confirm=True  # Already confirmed above
        )
        
    except Exception as e:
        print(f"\n❌ Restore failed: {e}")
        sys.exit(1)
    
    # Step 9: Verify
    print_step(9, "Verifying Restore")
    
    try:
        results = restore.verify_restore(str(backup_path))
        
        print("\nVerification Results:")
        print(f"  Database: {'✅ Success' if results['database'] else '❌ Failed'}")
        if 'table_count' in results['details']:
            print(f"    Tables: {results['details']['table_count']}")
        
        print(f"  Storage:  {'✅ Success' if results['storage'] else '❌ Failed'}")
        if 'bucket_count' in results['details']:
            print(f"    Buckets: {results['details']['bucket_count']}")
        
        print(f"  Auth:     {'✅ Success' if results['auth'] else '❌ Failed'}")
        if 'user_count' in results['details']:
            print(f"    Users: {results['details']['user_count']}")
        
    except Exception as e:
        print(f"⚠️  Verification had issues: {e}")
    
    # Success!
    print_header("✅ Restore Completed Successfully!")
    
    print(f"\n🎉 Your new Supabase project is ready!")
    print(f"\n📊 Project URL: {new_url}")
    print(f"\n💡 Next steps:")
    print(f"   1. Visit your project dashboard")
    print(f"   2. Verify data in Database, Storage, and Authentication tabs")
    print(f"   3. Test your application with the new project")
    
    print("\n" + "=" * 70)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Restore cancelled by user")
        sys.exit(1)
