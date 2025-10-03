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
    
    # List available backups
    backups = sorted([d for d in backups_dir.iterdir() if d.is_dir()], reverse=True)
    
    if not backups:
        print("❌ No backups found!")
        sys.exit(1)
    
    print("\nAvailable backups:")
    for i, backup in enumerate(backups[:10], 1):  # Show last 10
        size = sum(f.stat().st_size for f in backup.rglob('*') if f.is_file())
        size_mb = size / (1024 * 1024)
        print(f"  {i}. {backup.name} ({size_mb:.1f} MB)")
    
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
    
    # Step 2: Get new project credentials
    print_step(2, "Enter New Project Credentials")
    
    print("\nYou need credentials from your NEW Supabase project.")
    print("Get these from: https://supabase.com/dashboard")
    print("")
    
    use_env_file = input("Do you have a .env file for the new project? (yes/no): ").strip().lower()
    
    if use_env_file == 'yes':
        env_file = input("Enter path to .env file (default: .env.new): ").strip() or ".env.new"
        if not Path(env_file).exists():
            print(f"❌ File not found: {env_file}")
            sys.exit(1)
        load_dotenv(env_file)
        new_url = os.getenv('SUPABASE_URL')
        new_key = os.getenv('SUPABASE_KEY')
        new_db_url = os.getenv('SUPABASE_DB_URL')
    else:
        print("\n📋 Enter new project credentials:")
        print("\nGet these from your new Supabase project dashboard:")
        print("  1. Project URL: From dashboard URL or Settings → API")
        print("  2. Service Role Key: Settings → API → service_role (secret)")
        print("  3. Database URL: Click 'Connect' button → Direct connection")
        print("")
        
        new_url = input("  Supabase URL (e.g., https://abcxyz.supabase.co): ").strip()
        if not new_url.startswith('http'):
            new_url = f"https://{new_url}"
        
        new_key = input("  Service Role Key (starts with eyJ...): ").strip()
        new_db_url = input("  Database URL (postgresql://postgres:...): ").strip()
        
        # Save to .env.new
        save = input("\nSave these credentials to .env.new? (yes/no): ").strip().lower()
        if save == 'yes':
            with open('.env.new', 'w') as f:
                f.write(f"SUPABASE_URL={new_url}\n")
                f.write(f"SUPABASE_KEY={new_key}\n")
                f.write(f"SUPABASE_DB_URL={new_db_url}\n")
                f.write(f"BACKUP_DIR=./backups\n")
            print("✅ Credentials saved to .env.new")
    
    # Step 3: Verify connection
    print_step(3, "Verifying Connection to New Project")
    
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
    
    # Step 4: Choose what to restore
    print_step(4, "Select Components to Restore")
    
    print("\nWhat do you want to restore?")
    restore_database = input("  Restore database? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_storage = input("  Restore storage files? (yes/no) [yes]: ").strip().lower() != 'no'
    restore_auth = input("  Restore auth users? (yes/no) [yes]: ").strip().lower() != 'no'
    
    # Step 5: Confirm
    print_step(5, "Confirmation")
    
    print("\n⚠️  WARNING: This will overwrite existing data in the new project!")
    print(f"\nBackup: {backup_path}")
    print(f"Target: {new_url}")
    print(f"\nWill restore:")
    print(f"  Database: {'✅ Yes' if restore_database else '❌ No'}")
    print(f"  Storage:  {'✅ Yes' if restore_storage else '❌ No'}")
    print(f"  Auth:     {'✅ Yes' if restore_auth else '❌ No'}")
    
    confirm = input("\nType 'yes' to proceed: ").strip().lower()
    if confirm != 'yes':
        print("❌ Restore cancelled")
        sys.exit(0)
    
    # Step 6: Perform restore
    print_step(6, "Restoring Backup")
    
    try:
        restore = SupabaseRestore(new_url, new_key, new_db_url)
        
        restore.restore_backup(
            backup_path=str(backup_path),
            restore_database=restore_database,
            restore_storage=restore_storage,
            restore_auth=restore_auth,
            confirm=True  # Already confirmed above
        )
        
    except Exception as e:
        print(f"\n❌ Restore failed: {e}")
        sys.exit(1)
    
    # Step 7: Verify
    print_step(7, "Verifying Restore")
    
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
    print(f"\n📝 New credentials saved in: .env.new")
    
    print("\n" + "=" * 70)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Restore cancelled by user")
        sys.exit(1)
