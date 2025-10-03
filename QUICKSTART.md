# Quick Start Guide 🚀

Get up and running with Supabase Backup & Restore in 5 minutes!

## Step 1: Install Dependencies

```bash
pip install -r requirements.txt
```

## Step 2: Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:your-password@db.xxxxx.supabase.co:5432/postgres
BACKUP_DIR=./backups
```

### Where to Find Your Credentials

1. Go to your Supabase project dashboard
2. Click on **Settings** (gear icon)
3. Navigate to **API** section:
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **service_role** key → `SUPABASE_KEY`
4. Navigate to **Database** section:
   - Copy **Connection string** (Direct connection) → `SUPABASE_DB_URL`
   - Replace `[YOUR-PASSWORD]` with your actual database password

## Step 3: Verify Configuration

```bash
python cli.py config
```

You should see your configuration displayed (with sensitive data masked).

## Step 4: Create Your First Backup

```bash
python cli.py backup
```

This will create a complete backup including:
- ✅ Database schema and data
- ✅ Storage files
- ✅ Authentication users

## Step 5: List Your Backups

```bash
python cli.py list
```

## Step 6: Test Restore (Optional)

⚠️ **Warning**: This will overwrite your current data!

```bash
# Restore the latest backup
python cli.py restore --latest

# Or restore a specific backup
python cli.py restore ./backups/backup_20241004_123456
```

## Common Commands

### Create Backups

```bash
# Full backup
python cli.py backup

# Database only
python cli.py backup --no-storage --no-auth

# Custom location
python cli.py backup --output /path/to/backups
```

### Restore Backups

```bash
# Restore latest (with confirmation)
python cli.py restore --latest

# Restore without confirmation
python cli.py restore --latest --yes

# Restore specific components
python cli.py restore --latest --no-auth
```

### Manage Backups

```bash
# List all backups
python cli.py list

# Verify a restore
python cli.py verify ./backups/backup_20241004_123456
```

## Troubleshooting

### "pg_dump: command not found"

Install PostgreSQL client tools:

**macOS:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-client
```

### "Permission denied" or "Invalid API key"

- Double-check your `SUPABASE_KEY` is the **service_role** key, not the anon key
- Ensure there are no extra spaces in your `.env` file

### "Connection refused" for database

- Verify your `SUPABASE_DB_URL` is correct
- Make sure you've replaced `[YOUR-PASSWORD]` with your actual password
- Check that your IP is allowed in Supabase database settings

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check out [example_usage.py](example_usage.py) for programmatic usage
- Set up automated backups with cron jobs
- Explore partial backups for specific use cases

## Need Help?

- Check the [README.md](README.md) troubleshooting section
- Review the example scripts
- Open an issue on GitHub

Happy backing up! 🎉
