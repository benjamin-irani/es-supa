#!/bin/bash
# Quick restore script for Supabase backup

set -e

BACKUP_DIR="$1"
NEW_ENV_FILE="${2:-.env.new}"

if [ -z "$BACKUP_DIR" ]; then
    echo "=============================================================="
    echo "Quick Restore Script"
    echo "=============================================================="
    echo ""
    echo "Usage: ./quick_restore.sh <backup_directory> [env_file]"
    echo ""
    echo "Example:"
    echo "  ./quick_restore.sh backups/backup_20251004_074026"
    echo "  ./quick_restore.sh backups/backup_20251004_074026 .env.new"
    echo ""
    echo "Available backups:"
    ls -1 backups/ | grep backup_ | tail -5
    echo ""
    exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory not found: $BACKUP_DIR"
    exit 1
fi

if [ ! -f "$NEW_ENV_FILE" ]; then
    echo "❌ Environment file not found: $NEW_ENV_FILE"
    echo ""
    echo "Create it with:"
    echo "  cat > $NEW_ENV_FILE << EOF"
    echo "  SUPABASE_URL=https://your-new-project.supabase.co"
    echo "  SUPABASE_KEY=your-service-role-key"
    echo "  SUPABASE_DB_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"
    echo "  EOF"
    exit 1
fi

echo "=============================================================="
echo "Restoring Supabase Backup"
echo "=============================================================="
echo "Backup: $BACKUP_DIR"
echo "Config: $NEW_ENV_FILE"
echo ""

# Load environment
export $(cat $NEW_ENV_FILE | grep -v '^#' | xargs)

# Verify backup
if [ ! -f "$BACKUP_DIR/database.sql" ]; then
    echo "⚠️  Warning: database.sql not found in backup"
fi

if [ ! -d "$BACKUP_DIR/storage" ]; then
    echo "⚠️  Warning: storage directory not found in backup"
fi

if [ ! -f "$BACKUP_DIR/auth_users.json" ]; then
    echo "⚠️  Warning: auth_users.json not found in backup"
fi

# Confirm
echo ""
echo "⚠️  WARNING: This will overwrite data in the new project!"
echo ""
read -p "Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 0
fi

# Restore database
if [ -f "$BACKUP_DIR/database.sql" ]; then
    echo ""
    echo "=============================================================="
    echo "1️⃣  Restoring Database"
    echo "=============================================================="
    
    # Make sure we have the right PostgreSQL version
    export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
    
    echo "Restoring database..."
    psql "$SUPABASE_DB_URL" -f "$BACKUP_DIR/database.sql" 2>&1 | \
        grep -i "error" || echo "✅ Database restored successfully"
else
    echo ""
    echo "⏭️  Skipping database restore (no database.sql found)"
fi

# Restore storage and auth using Python
echo ""
echo "=============================================================="
echo "2️⃣  Restoring Storage and Auth"
echo "=============================================================="

python3 << EOF
from supabase_restore import SupabaseRestore
import os
from pathlib import Path

restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)

backup_path = Path('$BACKUP_DIR')

# Restore storage
if (backup_path / 'storage').exists():
    print('\n📁 Restoring storage...')
    restore._restore_storage(backup_path)
else:
    print('\n⏭️  Skipping storage restore (no storage directory found)')

# Restore auth
if (backup_path / 'auth_users.json').exists():
    print('\n👤 Restoring auth users...')
    restore._restore_auth(backup_path)
else:
    print('\n⏭️  Skipping auth restore (no auth_users.json found)')
EOF

# Verify
echo ""
echo "=============================================================="
echo "3️⃣  Verifying Restore"
echo "=============================================================="

python3 << EOF
from supabase_restore import SupabaseRestore
import os

restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)

results = restore.verify_restore('$BACKUP_DIR')

print('\nVerification Results:')
print(f"  Database: {'✅ Success' if results['database'] else '❌ Failed'}")
if 'table_count' in results['details']:
    print(f"    Tables: {results['details']['table_count']}")

print(f"  Storage:  {'✅ Success' if results['storage'] else '❌ Failed'}")
if 'bucket_count' in results['details']:
    print(f"    Buckets: {results['details']['bucket_count']}")

print(f"  Auth:     {'✅ Success' if results['auth'] else '❌ Failed'}")
if 'user_count' in results['details']:
    print(f"    Users: {results['details']['user_count']}")
EOF

# Success
echo ""
echo "=============================================================="
echo "✅ Restore Completed!"
echo "=============================================================="
echo ""
echo "🎉 Your new Supabase project is ready!"
echo ""
echo "📊 Project URL: $SUPABASE_URL"
echo ""
echo "💡 Next steps:"
echo "   1. Visit your project dashboard"
echo "   2. Verify data in Database, Storage, and Authentication"
echo "   3. Test your application with the new project"
echo ""
echo "=============================================================="
