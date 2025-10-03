# 🔄 Restore Backup to New Supabase Project

## 📋 **Prerequisites**

Before restoring, you need:

1. ✅ **A backup** (from `backups/` directory or GitHub Actions)
2. ✅ **A new Supabase project** created
3. ✅ **New project credentials** (URL, service role key, database URL)
4. ✅ **IPv4 add-on enabled** on new project (for database restore)

---

## 🚀 **Quick Start**

### **Step 1: Create New Supabase Project**

1. Go to: https://supabase.com/dashboard
2. Click **"New Project"**
3. Fill in details:
   - **Name:** Your project name
   - **Database Password:** Choose a strong password
   - **Region:** Select closest to you
4. Click **"Create new project"**
5. **Wait 2-3 minutes** for provisioning

### **Step 2: Enable IPv4 Add-on** (Required for Database Restore)

1. In new project dashboard
2. Go to: **Settings** → **Add-ons**
3. Enable **"IPv4 Address"** add-on
4. Wait for provisioning (~5 minutes)

### **Step 3: Get New Project Credentials**

1. Click **"Connect"** button in dashboard
2. Copy these values:

**Project URL:**
```
https://YOUR-NEW-PROJECT-REF.supabase.co
```

**Service Role Key:**
```
Settings → API → service_role key (secret)
```

**Database URL:**
```
Click "Connect" → Direct connection or Session pooler
```

### **Step 4: Create New Environment File**

Create `.env.new` file with new project credentials:

```bash
# Copy template
cp .env .env.new

# Edit with new credentials
nano .env.new
```

Update these values:
```env
SUPABASE_URL=https://YOUR-NEW-PROJECT-REF.supabase.co
SUPABASE_KEY=your-new-service-role-key
SUPABASE_DB_URL=postgresql://postgres:password@db.YOUR-NEW-PROJECT-REF.supabase.co:5432/postgres
```

---

## 🔄 **Restore Methods**

### **Method 1: Using CLI (Recommended)**

```bash
# Restore complete backup
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new

# Or restore specific components
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new --database-only
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new --storage-only
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new --auth-only
```

### **Method 2: Using Python Script**

```python
from dotenv import load_dotenv
from supabase_restore import SupabaseRestore
import os

# Load new project credentials
load_dotenv('.env.new')

# Initialize restore
restore = SupabaseRestore(
    supabase_url=os.getenv('SUPABASE_URL'),
    supabase_key=os.getenv('SUPABASE_KEY'),
    db_url=os.getenv('SUPABASE_DB_URL')
)

# Restore backup
restore.restore_backup(
    backup_path='backups/backup_20251004_074026',
    restore_database=True,
    restore_storage=True,
    restore_auth=True,
    confirm=False  # Will prompt for confirmation
)
```

### **Method 3: Manual Step-by-Step**

See detailed steps below.

---

## 📊 **Detailed Restore Process**

### **1. Restore Database**

#### **Option A: Using psql (Recommended)**

```bash
# Set environment variables
export NEW_DB_URL="postgresql://postgres:password@db.NEW-PROJECT.supabase.co:5432/postgres"

# Restore database
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
psql $NEW_DB_URL -f backups/backup_20251004_074026/database.sql
```

#### **Option B: Using Supabase Dashboard**

1. Go to: SQL Editor in new project
2. Copy contents of `database.sql`
3. Paste and run in SQL Editor
4. May need to run in chunks if file is large

#### **Option C: Using restore script**

```bash
python3 -c "
from supabase_restore import SupabaseRestore
from dotenv import load_dotenv
import os

load_dotenv('.env.new')
restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)
restore._restore_database('backups/backup_20251004_074026')
"
```

### **2. Restore Storage**

```bash
python3 -c "
from supabase_restore import SupabaseRestore
from dotenv import load_dotenv
import os

load_dotenv('.env.new')
restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)
restore._restore_storage('backups/backup_20251004_074026')
"
```

This will:
- Create all storage buckets
- Upload all files
- Preserve directory structure

### **3. Restore Auth Users**

```bash
python3 -c "
from supabase_restore import SupabaseRestore
from dotenv import load_dotenv
import os

load_dotenv('.env.new')
restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)
restore._restore_auth('backups/backup_20251004_074026')
"
```

This will:
- Create all users
- Restore user metadata
- Restore app metadata
- Auto-confirm emails

---

## ✅ **Verification**

### **Verify Restore Completed Successfully:**

```bash
# Run verification
python3 verify_restore.py --env-file .env.new

# Or manually check
python3 -c "
from supabase_restore import SupabaseRestore
from dotenv import load_dotenv
import os

load_dotenv('.env.new')
restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)
results = restore.verify_restore('backups/backup_20251004_074026')
print(results)
"
```

### **Manual Verification:**

**Check Database:**
```bash
psql $NEW_DB_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Should show: 124 tables
```

**Check Storage:**
```bash
# Go to Storage in dashboard
# Should see: 18 buckets
```

**Check Auth:**
```bash
# Go to Authentication in dashboard
# Should see: 9 users
```

---

## ⚠️ **Important Notes**

### **Before Restoring:**

1. **⚠️ WARNING:** Restore will overwrite existing data in the new project
2. **Backup first:** If new project has data, back it up first
3. **Test restore:** Consider testing on a staging project first
4. **Check compatibility:** Ensure PostgreSQL versions match

### **Database Restore:**

- **May take time:** Large databases (20+ MB) can take 5-10 minutes
- **Warnings are normal:** psql may show warnings, check for ERRORs
- **Schema first:** Database schema is restored before data
- **Constraints:** Foreign key constraints are restored last

### **Storage Restore:**

- **Bucket names:** Must match exactly
- **File paths:** Directory structure is preserved
- **Overwrite:** Files with same name will be overwritten
- **Large files:** May take time to upload

### **Auth Restore:**

- **Emails:** Users will have confirmed emails
- **Passwords:** Original passwords are NOT restored (users need to reset)
- **Metadata:** User and app metadata are restored
- **Duplicates:** Existing users with same email will cause warnings

---

## 🔧 **Troubleshooting**

### **Database Restore Fails**

**Error: "permission denied"**
```bash
# Solution: Use service_role key, not anon key
# Check .env.new has correct service_role key
```

**Error: "relation already exists"**
```bash
# Solution: Drop existing tables first
psql $NEW_DB_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
# Then restore again
```

**Error: "version mismatch"**
```bash
# Solution: Upgrade local PostgreSQL
brew upgrade postgresql@15
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
```

### **Storage Restore Fails**

**Error: "bucket already exists"**
```bash
# Solution: Delete existing buckets in dashboard first
# Or skip bucket creation in restore script
```

**Error: "file upload failed"**
```bash
# Solution: Check file permissions
chmod -R 644 backups/backup_*/storage/*
```

### **Auth Restore Fails**

**Error: "user already exists"**
```bash
# Solution: This is a warning, not an error
# Existing users are skipped
```

**Error: "invalid email"**
```bash
# Solution: Check auth_users.json for invalid emails
# Remove or fix invalid entries
```

---

## 📋 **Complete Restore Checklist**

- [ ] New Supabase project created
- [ ] IPv4 add-on enabled on new project
- [ ] New project credentials obtained
- [ ] `.env.new` file created with new credentials
- [ ] Backup directory ready (`backups/backup_YYYYMMDD_HHMMSS/`)
- [ ] PostgreSQL 15 installed locally
- [ ] Database restored successfully
- [ ] Storage buckets and files restored
- [ ] Auth users restored
- [ ] Verification completed
- [ ] New project tested and working

---

## 🎯 **Quick Restore Script**

Save this as `quick_restore.sh`:

```bash
#!/bin/bash
# Quick restore script

BACKUP_DIR="$1"
NEW_ENV_FILE="${2:-.env.new}"

if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: ./quick_restore.sh <backup_directory> [env_file]"
    echo "Example: ./quick_restore.sh backups/backup_20251004_074026 .env.new"
    exit 1
fi

echo "=============================================================="
echo "Restoring Supabase Backup"
echo "=============================================================="
echo "Backup: $BACKUP_DIR"
echo "Config: $NEW_ENV_FILE"
echo ""

# Load environment
export $(cat $NEW_ENV_FILE | xargs)

# Restore database
echo "1️⃣  Restoring database..."
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
psql $SUPABASE_DB_URL -f "$BACKUP_DIR/database.sql" 2>&1 | grep -i error || echo "✅ Database restored"

# Restore storage and auth
echo ""
echo "2️⃣  Restoring storage and auth..."
python3 -c "
from supabase_restore import SupabaseRestore
import os

restore = SupabaseRestore(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY'),
    os.getenv('SUPABASE_DB_URL')
)
restore._restore_storage('$BACKUP_DIR')
restore._restore_auth('$BACKUP_DIR')
"

echo ""
echo "=============================================================="
echo "✅ Restore completed!"
echo "=============================================================="
echo ""
echo "Verify at: $SUPABASE_URL"
```

Make it executable:
```bash
chmod +x quick_restore.sh
```

Run it:
```bash
./quick_restore.sh backups/backup_20251004_074026 .env.new
```

---

## 🎉 **Success!**

After restore, your new Supabase project should have:
- ✅ All database tables (124 tables)
- ✅ All data from original project
- ✅ All storage buckets (18 buckets)
- ✅ All storage files (25 files, 85 MB)
- ✅ All auth users (9 users)

**Your new project is a complete clone of the original!** 🚀
