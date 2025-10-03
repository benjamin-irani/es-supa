# Getting Started with Supabase Backup & Restore 🎯

Welcome! This guide will walk you through your first backup in just a few minutes.

## Prerequisites ✅

Before you begin, make sure you have:

1. **Python 3.8 or higher** installed
   ```bash
   python3 --version
   ```

2. **A Supabase project** with data you want to backup

3. **PostgreSQL client tools** (we'll help you install these)

## Step-by-Step Setup

### 1. Install PostgreSQL Tools

These are required for database backup/restore:

**macOS:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql-client
```

**Windows:**
Download from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

Verify installation:
```bash
pg_dump --version
psql --version
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or use a virtual environment (recommended):
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Get Your Supabase Credentials

You need three pieces of information from your Supabase project:

#### A. Project URL
1. Go to [app.supabase.com](https://app.supabase.com)
2. Select your project
3. Click **Settings** → **API**
4. Copy the **Project URL**
   - Example: `https://abcdefghijk.supabase.co`

#### B. Service Role Key
1. In the same **API** settings page
2. Find **Project API keys**
3. Copy the **service_role** key (NOT the anon key!)
   - ⚠️ This is a secret key - keep it safe!
   - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### C. Database Connection String
1. Click **Settings** → **Database**
2. Find **Connection string** section
3. Select **URI** tab
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your actual database password
   - Example: `postgresql://postgres:your-password@db.abcdefghijk.supabase.co:5432/postgres`

### 4. Configure Environment Variables

Create your `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:your-password@db.abcdefghijk.supabase.co:5432/postgres
BACKUP_DIR=./backups
```

### 5. Test Your Connection

Run the connection test script:
```bash
python test_connection.py
```

You should see all tests pass:
```
✅ PASS - Environment Variables
✅ PASS - PostgreSQL Tools
✅ PASS - Supabase API
✅ PASS - Database Connection
✅ PASS - Auth API
```

If any tests fail, check the error messages and fix the issues.

### 6. Create Your First Backup

Now you're ready to create a backup!

**Option A: Using the shell script (easiest)**
```bash
./run_backup.sh
```

**Option B: Using the CLI directly**
```bash
python cli.py backup
```

You should see progress indicators:
```
🚀 Starting Supabase backup...

Creating backup at: ./backups/backup_20241004_055044

📊 Backing up database...
  ✓ Database dumped to ./backups/backup_20241004_055044/database.sql
  Exporting tables: 100%|████████████| 15/15

📁 Backing up storage files...
  Backing up buckets: 100%|████████████| 3/3
  ✓ Storage backed up

👤 Backing up auth users...
  ✓ Backed up 42 auth users

✅ Backup completed successfully!
```

### 7. Verify Your Backup

List your backups:
```bash
python cli.py list
```

You should see your backup listed with timestamp and components.

## What's Next?

### Learn More Commands

```bash
# View all available commands
python cli.py --help

# View help for a specific command
python cli.py backup --help
python cli.py restore --help
```

### Try Different Backup Types

```bash
# Database only (faster, smaller)
python cli.py backup --no-storage --no-auth

# Custom backup location
python cli.py backup --output /path/to/backups
```

### Test Restore (Optional)

⚠️ **Warning**: Only do this on a test project!

```bash
# Restore the latest backup
python cli.py restore --latest

# Or restore a specific backup
python cli.py restore ./backups/backup_20241004_055044
```

### Programmatic Usage

Check out `example_usage.py` for using the tool in your own Python scripts:

```python
from supabase_backup import SupabaseBackup

backup = SupabaseBackup(
    supabase_url=os.getenv('SUPABASE_URL'),
    supabase_key=os.getenv('SUPABASE_KEY'),
    db_url=os.getenv('SUPABASE_DB_URL')
)

backup_path = backup.create_backup()
```

### Set Up Automated Backups

Create a cron job for daily backups:

```bash
# Edit crontab
crontab -e

# Add this line for daily backups at 2 AM
0 2 * * * cd /path/to/supapy && /path/to/python cli.py backup --yes
```

## Troubleshooting

### "pg_dump: command not found"
→ Install PostgreSQL client tools (see Step 1)

### "Invalid API key" or "Permission denied"
→ Make sure you're using the **service_role** key, not the anon key

### "Connection refused" for database
→ Check your database URL and password are correct

### "No module named 'supabase'"
→ Install dependencies: `pip install -r requirements.txt`

## Need Help?

- 📖 Read the full [README.md](README.md)
- 🚀 Check [QUICKSTART.md](QUICKSTART.md)
- 🏗️ Review [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- 💡 See [example_usage.py](example_usage.py)
- 📝 View [CHANGELOG.md](CHANGELOG.md)

## Success! 🎉

You now have a working Supabase backup system! Your data is safe and you can restore it anytime.

**Pro Tips:**
- Schedule regular automated backups
- Test your restore process periodically
- Store backups in a secure location
- Keep multiple backup versions
- Document your backup strategy

Happy backing up! 🚀
