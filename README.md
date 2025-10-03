# Supabase Backup & Restore Tool 🚀

A comprehensive Python tool for backing up and restoring Supabase projects, including database schemas, data, storage files, and authentication users.

## Features ✨

- **Database Backup**: Full PostgreSQL database dump with schema and data
- **Storage Backup**: Download all files from Supabase Storage buckets
- **Auth Backup**: Export authentication users and metadata
- **Easy Restore**: Restore any backup to the same or different Supabase project
- **CLI Interface**: Simple command-line interface for common operations
- **Programmatic API**: Use as a Python library in your own scripts
- **Verification**: Verify restore operations to ensure data integrity

## Installation 📦

1. Clone or download this repository
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Install PostgreSQL tools (required for database backup/restore):

**macOS:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-client
```

**Windows:**
Download and install from [PostgreSQL official site](https://www.postgresql.org/download/windows/)

## Configuration ⚙️

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project.supabase.co:5432/postgres
BACKUP_DIR=./backups
```

### Finding Your Credentials

- **SUPABASE_URL**: Project Settings → API → Project URL
- **SUPABASE_KEY**: Project Settings → API → service_role key (⚠️ Keep this secret!)
- **SUPABASE_DB_URL**: Project Settings → Database → Connection string (Direct connection)

## Usage 🎯

### Command Line Interface

#### Create a Backup

```bash
# Full backup (database + storage + auth)
python cli.py backup

# Database only
python cli.py backup --no-storage --no-auth

# Custom output directory
python cli.py backup --output /path/to/backups
```

#### List Backups

```bash
python cli.py list
```

#### Restore a Backup

```bash
# Restore specific backup (will prompt for confirmation)
python cli.py restore /path/to/backup_20241004_123456

# Restore latest backup
python cli.py restore --latest

# Skip confirmation prompt
python cli.py restore --latest --yes

# Restore database only
python cli.py restore --latest --no-storage --no-auth
```

#### Verify a Restore

```bash
python cli.py verify /path/to/backup_20241004_123456
```

#### Show Configuration

```bash
python cli.py config
```

### Programmatic Usage

```python
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore
import os

# Create a backup
backup = SupabaseBackup(
    supabase_url=os.getenv('SUPABASE_URL'),
    supabase_key=os.getenv('SUPABASE_KEY'),
    db_url=os.getenv('SUPABASE_DB_URL'),
    backup_dir='./backups'
)

backup_path = backup.create_backup(
    include_storage=True,
    include_auth=True
)

# List backups
backups = backup.list_backups()
for b in backups:
    print(f"Backup: {b['timestamp']} at {b['path']}")

# Restore a backup
restore = SupabaseRestore(
    supabase_url=os.getenv('SUPABASE_URL'),
    supabase_key=os.getenv('SUPABASE_KEY'),
    db_url=os.getenv('SUPABASE_DB_URL')
)

restore.restore_backup(
    backup_path=backup_path,
    restore_database=True,
    restore_storage=True,
    restore_auth=True,
    confirm=True  # Skip confirmation
)

# Verify restore
results = restore.verify_restore(backup_path)
print(f"Database: {results['database']}")
print(f"Storage: {results['storage']}")
print(f"Auth: {results['auth']}")
```

See `example_usage.py` for more examples.

## Backup Structure 📁

Each backup creates a timestamped directory with the following structure:

```
backup_20241004_123456/
├── metadata.json              # Backup metadata
├── database.sql               # PostgreSQL dump
├── tables_json/               # Individual tables as JSON
│   ├── users.json
│   ├── posts.json
│   └── ...
├── storage/                   # Storage files
│   ├── buckets_metadata.json
│   ├── avatars/
│   ├── documents/
│   └── ...
└── auth_users.json           # Authentication users
```

## Security Considerations 🔒

- **Service Role Key**: The service role key has admin privileges. Keep it secure!
- **Backup Storage**: Backups contain sensitive data. Store them securely.
- **Database URL**: Contains database password. Never commit `.env` to version control.
- **Restore Confirmation**: Always review what you're restoring to avoid data loss.

## Common Use Cases 💡

### 1. Regular Backups

Set up a cron job for automated backups:

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/supapy && python cli.py backup --yes
```

### 2. Migration Between Projects

```bash
# Backup from production
SUPABASE_URL=https://prod.supabase.co python cli.py backup

# Restore to staging
SUPABASE_URL=https://staging.supabase.co python cli.py restore --latest --yes
```

### 3. Development Snapshots

```bash
# Before making changes
python cli.py backup --output ./dev-snapshots

# If something goes wrong
python cli.py restore ./dev-snapshots/backup_20241004_123456 --yes
```

### 4. Data Migration

```bash
# Backup only database (no storage/auth)
python cli.py backup --no-storage --no-auth

# Restore to new project
python cli.py restore --latest --no-storage --no-auth
```

## Troubleshooting 🔧

### pg_dump not found

Install PostgreSQL client tools (see Installation section).

### Permission denied errors

Ensure your service role key has the necessary permissions.

### Storage backup fails

Check that your storage buckets are accessible with the provided credentials.

### Database restore warnings

Some warnings during restore are normal (e.g., role/ownership warnings). Check for ERROR messages.

## Limitations ⚠️

- **Edge Functions**: Not currently backed up (coming soon)
- **Realtime Subscriptions**: Configuration not backed up
- **API Keys**: Not backed up for security reasons
- **Large Files**: Very large storage files may timeout (consider chunking)

## Contributing 🤝

Contributions are welcome! Please feel free to submit issues or pull requests.

## License 📄

MIT License - feel free to use this tool in your projects!

## Support 💬

For issues or questions:
1. Check the troubleshooting section
2. Review the example usage in `example_usage.py`
3. Open an issue on GitHub

## Roadmap 🗺️

- [ ] Edge Functions backup/restore
- [ ] Incremental backups
- [ ] Backup compression
- [ ] Cloud storage integration (S3, GCS)
- [ ] Backup encryption
- [ ] Scheduled backups with retention policies
- [ ] Web UI for backup management

---

**Made with ❤️ for the Supabase community**
