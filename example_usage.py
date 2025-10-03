"""
Example usage of the Supabase Backup & Restore library
This demonstrates how to use the library programmatically
"""

import os
from dotenv import load_dotenv
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore

# Load environment variables
load_dotenv()


def example_backup():
    """Example: Create a backup"""
    print("=" * 60)
    print("EXAMPLE: Creating a Backup")
    print("=" * 60)
    
    backup = SupabaseBackup(
        supabase_url=os.getenv('SUPABASE_URL'),
        supabase_key=os.getenv('SUPABASE_KEY'),
        db_url=os.getenv('SUPABASE_DB_URL'),
        backup_dir='./backups'
    )
    
    # Create a full backup
    backup_path = backup.create_backup(
        include_storage=True,
        include_auth=True
    )
    
    print(f"\nBackup created at: {backup_path}")
    return backup_path


def example_list_backups():
    """Example: List all backups"""
    print("\n" + "=" * 60)
    print("EXAMPLE: Listing Backups")
    print("=" * 60)
    
    backup = SupabaseBackup(
        supabase_url=os.getenv('SUPABASE_URL'),
        supabase_key=os.getenv('SUPABASE_KEY'),
        db_url=os.getenv('SUPABASE_DB_URL'),
        backup_dir='./backups'
    )
    
    backups = backup.list_backups()
    
    print(f"\nFound {len(backups)} backup(s):")
    for b in backups:
        print(f"  - {b['timestamp']}: {b['path']}")
    
    return backups


def example_restore(backup_path):
    """Example: Restore a backup"""
    print("\n" + "=" * 60)
    print("EXAMPLE: Restoring a Backup")
    print("=" * 60)
    
    restore = SupabaseRestore(
        supabase_url=os.getenv('SUPABASE_URL'),
        supabase_key=os.getenv('SUPABASE_KEY'),
        db_url=os.getenv('SUPABASE_DB_URL')
    )
    
    # Restore the backup (with confirmation)
    restore.restore_backup(
        backup_path=backup_path,
        restore_database=True,
        restore_storage=True,
        restore_auth=True,
        confirm=False  # Will prompt for confirmation
    )


def example_verify(backup_path):
    """Example: Verify a restore"""
    print("\n" + "=" * 60)
    print("EXAMPLE: Verifying Restore")
    print("=" * 60)
    
    restore = SupabaseRestore(
        supabase_url=os.getenv('SUPABASE_URL'),
        supabase_key=os.getenv('SUPABASE_KEY'),
        db_url=os.getenv('SUPABASE_DB_URL')
    )
    
    results = restore.verify_restore(backup_path)
    
    print("\nVerification Results:")
    print(f"  Database: {'✅' if results['database'] else '❌'}")
    print(f"  Storage: {'✅' if results['storage'] else '❌'}")
    print(f"  Auth: {'✅' if results['auth'] else '❌'}")
    print(f"\nDetails: {results['details']}")


def example_partial_backup():
    """Example: Create a partial backup (database only)"""
    print("\n" + "=" * 60)
    print("EXAMPLE: Partial Backup (Database Only)")
    print("=" * 60)
    
    backup = SupabaseBackup(
        supabase_url=os.getenv('SUPABASE_URL'),
        supabase_key=os.getenv('SUPABASE_KEY'),
        db_url=os.getenv('SUPABASE_DB_URL'),
        backup_dir='./backups'
    )
    
    # Create a database-only backup
    backup_path = backup.create_backup(
        include_storage=False,
        include_auth=False
    )
    
    print(f"\nDatabase-only backup created at: {backup_path}")
    return backup_path


if __name__ == '__main__':
    print("\n🚀 Supabase Backup & Restore - Example Usage\n")
    
    # Example 1: Create a backup
    # backup_path = example_backup()
    
    # Example 2: List all backups
    # backups = example_list_backups()
    
    # Example 3: Restore a backup
    # if backups:
    #     example_restore(backups[0]['path'])
    
    # Example 4: Verify a restore
    # if backups:
    #     example_verify(backups[0]['path'])
    
    # Example 5: Partial backup
    # example_partial_backup()
    
    print("\n💡 Tip: Uncomment the examples above to run them!")
    print("Make sure to configure your .env file first.\n")
