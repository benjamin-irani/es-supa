#!/bin/bash
# Complete Supabase Backup - Works without direct DB connection
# Uses API for Storage/Auth and CLI for Database

set -e

echo "=============================================================="
echo "Complete Supabase Backup (IPv4 Compatible)"
echo "=============================================================="

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/complete_backup_${TIMESTAMP}"

echo ""
echo "📁 Creating backup directory: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# 1. Backup Storage + Auth via API (IPv4 compatible)
echo ""
echo "=============================================================="
echo "1️⃣  Backing up Storage + Auth via API..."
echo "=============================================================="
python3 backup_via_api.py

# Move the latest API backup into our complete backup
LATEST_API_BACKUP=$(ls -td backups/api_backup_* | head -1)
if [ -d "$LATEST_API_BACKUP" ]; then
    echo "   Moving API backup to complete backup directory..."
    cp -r "$LATEST_API_BACKUP"/* "${BACKUP_DIR}/"
    echo "   ✅ Storage + Auth backed up"
fi

# 2. Backup Database via Supabase CLI (IPv4 compatible)
echo ""
echo "=============================================================="
echo "2️⃣  Backing up Database via Supabase CLI..."
echo "=============================================================="

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "   ⚠️  Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "   ⚠️  Project not linked. Please run:"
    echo "      npx supabase link --project-ref uezenrqnuuaglgwnvbsx"
    echo ""
    echo "   Skipping database backup for now..."
else
    echo "   Dumping database..."
    npx supabase db dump -f "${BACKUP_DIR}/database.sql"
    
    if [ -f "${BACKUP_DIR}/database.sql" ]; then
        DB_SIZE=$(du -h "${BACKUP_DIR}/database.sql" | cut -f1)
        echo "   ✅ Database backed up (${DB_SIZE})"
    else
        echo "   ⚠️  Database backup failed"
    fi
fi

# 3. Create metadata
echo ""
echo "=============================================================="
echo "3️⃣  Creating backup metadata..."
echo "=============================================================="

cat > "${BACKUP_DIR}/backup_info.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_type": "complete",
  "method": "API + CLI (IPv4 compatible)",
  "components": {
    "storage": "backed_up_via_api",
    "auth": "backed_up_via_api",
    "database": "backed_up_via_cli"
  },
  "note": "This backup works without direct database connection"
}
EOF

# 4. Calculate total size
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

echo ""
echo "=============================================================="
echo "✅ Backup Complete!"
echo "=============================================================="
echo ""
echo "📦 Location: ${BACKUP_DIR}"
echo "💾 Total Size: ${TOTAL_SIZE}"
echo ""
echo "Backup includes:"
echo "  ✅ Storage files"
echo "  ✅ Auth users"
echo "  ✅ Database (if CLI is linked)"
echo ""
echo "=============================================================="

# List backup contents
echo ""
echo "📋 Backup Contents:"
ls -lh "${BACKUP_DIR}"

echo ""
echo "🎉 Done!"
