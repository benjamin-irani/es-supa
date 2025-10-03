# Running the Application - Demo Guide 🎬

## Installation Required First

Before running the application, you need to install dependencies:

```bash
# Option 1: Direct install (recommended)
pip3 install -r requirements.txt

# Option 2: Using virtual environment (best practice)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Once Dependencies Are Installed

### 1. View Available Commands

```bash
python3 cli.py --help
```

**Expected Output:**
```
Usage: cli.py [OPTIONS] COMMAND [ARGS]...

  Supabase Backup & Restore Tool

  A comprehensive tool for backing up and restoring Supabase projects,
  including database, storage, and authentication data.

Options:
  --version  Show the version and exit.
  --help     Show this message and exit.

Commands:
  backup   Create a new backup of your Supabase project
  config   Show current configuration
  list     List all available backups
  restore  Restore a backup to your Supabase project
  verify   Verify a restored backup
```

### 2. Configure Your Environment

```bash
# Copy the example configuration
cp .env.example .env

# Edit .env with your Supabase credentials
# You need:
# - SUPABASE_URL (from Supabase dashboard → Settings → API)
# - SUPABASE_KEY (service_role key from Settings → API)
# - SUPABASE_DB_URL (from Settings → Database → Connection string)
```

### 3. Test Your Connection

```bash
python3 test_connection.py
```

**Expected Output (if configured correctly):**
```
🔍 Checking environment variables...
  ✅ SUPABASE_URL: https://xxxxx.supabase.co
  ✅ SUPABASE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ✅ SUPABASE_DB_URL: postgresql://postgres:...
  ✅ All environment variables are set

🔍 Testing Supabase API connection...
  ✅ Connected to Supabase API
  ℹ️  Found 3 storage bucket(s)

🔍 Testing database connection...
  ✅ Connected to PostgreSQL database
  ℹ️  PostgreSQL version: PostgreSQL 15.1
  ℹ️  Found 12 table(s) in public schema

🔍 Testing Auth API connection...
  ✅ Connected to Auth API
  ℹ️  Found 5 user(s)

🔍 Checking PostgreSQL tools...
  ✅ pg_dump: pg_dump (PostgreSQL) 15.1
  ✅ psql: psql (PostgreSQL) 15.1

🎉 All tests passed! You're ready to create backups.
```

### 4. Create Your First Backup

```bash
python3 cli.py backup
```

**Expected Output:**
```
🚀 Starting Supabase backup...

Creating backup at: ./backups/backup_20241004_060000

📊 Backing up database...
  ✓ Database dumped to ./backups/backup_20241004_060000/database.sql
  Exporting tables: 100%|████████████████| 12/12
  ✓ Tables exported to JSON in ./backups/backup_20241004_060000/tables_json

📁 Backing up storage files...
  Backing up buckets: 100%|████████████████| 3/3
  ✓ Storage backed up to ./backups/backup_20241004_060000/storage

👤 Backing up auth users...
  ✓ Backed up 5 auth users to ./backups/backup_20241004_060000/auth_users.json

✅ Backup completed successfully at: ./backups/backup_20241004_060000

✨ Backup saved to: ./backups/backup_20241004_060000
```

### 5. List Your Backups

```bash
python3 cli.py list
```

**Expected Output:**
```
📦 Available Backups:

╔════════════════════════╦═══════════════════════╦═══════════════════════════╗
║ Timestamp              ║ Components            ║ Name                      ║
╠════════════════════════╬═══════════════════════╬═══════════════════════════╣
║ 2024-10-04 06:00:00   ║ Storage, Auth, Database║ backup_20241004_060000   ║
║ 2024-10-03 02:00:00   ║ Storage, Auth, Database║ backup_20241003_020000   ║
╚════════════════════════╩═══════════════════════╩═══════════════════════════╝

Backup directory: ./backups
```

### 6. Restore a Backup

```bash
python3 cli.py restore --latest
```

**Expected Output:**
```
🚀 Starting Supabase restore...

Restoring backup from: 2024-10-04T06:00:00
Original URL: https://xxxxx.supabase.co
Target URL: https://xxxxx.supabase.co

⚠️  WARNING: This will overwrite existing data!
Are you sure you want to continue? (yes/no): yes

📊 Restoring database...
  ✓ Database restored from ./backups/backup_20241004_060000/database.sql

📁 Restoring storage files...
  Creating buckets: 100%|████████████████| 3/3
    ✓ Created bucket: avatars
    ✓ Created bucket: documents
    ✓ Created bucket: images
  ✓ Storage restored

👤 Restoring auth users...
  Restoring users: 100%|████████████████| 5/5
  ✓ Restored 5 auth users

✅ Restore completed successfully!
```

### 7. Verify Configuration

```bash
python3 cli.py config
```

**Expected Output:**
```
⚙️  Current Configuration:

╔═══════════════════╦════════════════════════════════════════╗
║ Setting           ║ Value                                  ║
╠═══════════════════╬════════════════════════════════════════╣
║ Supabase URL      ║ https://xxxxx.supabase.co             ║
║ Supabase Key      ║ eyJhbGciOi...                         ║
║ Database          ║ db.xxxxx.supabase.co:5432/postgres    ║
║ Backup Directory  ║ ./backups                             ║
╚═══════════════════╩════════════════════════════════════════╝
```

## Command Reference

### Backup Commands

```bash
# Full backup
python3 cli.py backup

# Database only (skip storage and auth)
python3 cli.py backup --no-storage --no-auth

# Skip auth users
python3 cli.py backup --no-auth

# Custom output directory
python3 cli.py backup --output /path/to/backups
```

### Restore Commands

```bash
# Restore latest backup (with confirmation)
python3 cli.py restore --latest

# Restore specific backup
python3 cli.py restore ./backups/backup_20241004_060000

# Restore without confirmation prompt
python3 cli.py restore --latest --yes

# Restore database only
python3 cli.py restore --latest --no-storage --no-auth
```

### Management Commands

```bash
# List all backups
python3 cli.py list

# Verify a restore
python3 cli.py verify ./backups/backup_20241004_060000

# Show configuration
python3 cli.py config

# Get help
python3 cli.py --help
python3 cli.py backup --help
```

## Quick Start Script

Use the provided shell script for quick backups:

```bash
./run_backup.sh
```

This script will:
1. Check if .env exists
2. Create virtual environment if needed
3. Install dependencies
4. Run the backup

## Programmatic Usage

You can also use the tool in your Python scripts:

```python
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore
import os

# Create a backup
backup = SupabaseBackup(
    supabase_url=os.getenv('SUPABASE_URL'),
    supabase_key=os.getenv('SUPABASE_KEY'),
    db_url=os.getenv('SUPABASE_DB_URL')
)

backup_path = backup.create_backup()
print(f"Backup created at: {backup_path}")

# List backups
backups = backup.list_backups()
for b in backups:
    print(f"Backup: {b['timestamp']}")

# Restore
restore = SupabaseRestore(
    supabase_url=os.getenv('SUPABASE_URL'),
    supabase_key=os.getenv('SUPABASE_KEY'),
    db_url=os.getenv('SUPABASE_DB_URL')
)

restore.restore_backup(backup_path, confirm=True)
```

## Troubleshooting

### Dependencies Won't Install

If `pip install -r requirements.txt` is slow or fails:

```bash
# Try upgrading pip first
python3 -m pip install --upgrade pip

# Then install dependencies
pip3 install -r requirements.txt

# Or install one by one
pip3 install supabase python-dotenv click psycopg2-binary requests tqdm tabulate
```

### Module Not Found Errors

Make sure you're in the correct directory and dependencies are installed:

```bash
cd /Users/benjaminirani/Desktop/dev/supapy
pip3 install -r requirements.txt
python3 cli.py --help
```

### Connection Errors

Run the connection test to diagnose:

```bash
python3 test_connection.py
```

This will tell you exactly what's wrong with your configuration.

## Next Steps

1. **Install dependencies** (required)
2. **Configure .env** (required)
3. **Test connection** (recommended)
4. **Create first backup** (start here!)
5. **Set up automation** (optional)

For more details, see:
- [GETTING_STARTED.md](GETTING_STARTED.md) - Complete setup guide
- [README.md](README.md) - Full documentation
- [FAQ.md](FAQ.md) - Common questions

---

**Ready to start?** Install dependencies and configure your .env file!
