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
    
    # Step 3: Verify connection
    print_step(3, "Verifying Connection to Target Project")
    
    try:
        # Test database connection
        conn = psycopg2.connect(new_db_url, connect_timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        print(f"✅ Database connection successful")
        print(f"   PostgreSQL: {version.split(',')[0]}")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("\n💡 Make sure:")
        print("   1. IPv4 add-on is enabled in Supabase dashboard")
        print("   2. Database URL is correct")
        print("   3. You're using the service_role key, not anon key")
        sys.exit(1)
    
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
    
    # Step 6: Confirm
    print_step(6, "Confirmation")
    
    # Extract and display project IDs
    target_project_id = new_url.split('//')[1].split('.')[0]
    
    mode_warnings = {
        'clean': "\n⚠️  WARNING: This will drop conflicting objects and restore!",
        'merge': "\n⚠️  WARNING: This will add missing objects (existing data preserved)!",
        'force': "\n🚨 DANGER: This will DELETE ALL existing data and restore!"
    }
    print(mode_warnings.get(restore_mode, "\n⚠️  WARNING: This will modify your database!"))
    
    print(f"\n{'=' * 70}")
    print(f"📋 RESTORE SUMMARY")
    print(f"{'=' * 70}")
    print(f"\nBackup Source: {backup_path}")
    print(f"\nTarget Project:")
    print(f"  URL:        {new_url}")
    print(f"  Project ID: {target_project_id}")
    print(f"\nRestore Mode: {restore_mode.upper()}")
    print(f"\nComponents to Restore:")
    print(f"  Database:       {'✅ Yes' if restore_database else '❌ No'}")
    print(f"  Storage:        {'✅ Yes' if restore_storage else '❌ No'}")
    print(f"  Auth:           {'✅ Yes' if restore_auth else '❌ No'}")
    print(f"  Edge Functions: {'✅ Yes' if restore_edge_functions else '❌ No'}")
    print(f"  Roles:          {'✅ Yes' if restore_roles else '❌ No'}")
    print(f"  Realtime:       {'✅ Yes' if restore_realtime else '❌ No'}")
    print(f"  Webhooks:       {'✅ Yes' if restore_webhooks else '❌ No'}")
    print(f"{'=' * 70}")
    
    print(f"\n⚠️  IMPORTANT: Verify the target project ID above!")
    print(f"   Target Project ID: {target_project_id}")
    print(f"\n   Make sure this is the CORRECT project you want to restore to.")
    
    confirm = input("\nType 'yes' to proceed with restore: ").strip().lower()
    if confirm != 'yes':
        print("❌ Restore cancelled")
        sys.exit(0)
    
    # Step 7: Perform restore
    print_step(7, "Restoring Backup")
    
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
            mode=restore_mode,
            confirm=True  # Already confirmed above
        )
        
    except Exception as e:
        print(f"\n❌ Restore failed: {e}")
        sys.exit(1)
    
    # Step 8: Verify
    print_step(8, "Verifying Restore")
    
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
