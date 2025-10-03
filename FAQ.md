# Frequently Asked Questions (FAQ) ❓

## General Questions

### What does this tool backup?

The tool backs up three main components:
- **Database**: All tables, schemas, data, indexes, and constraints
- **Storage**: All files in all storage buckets
- **Auth**: All user accounts with metadata

### Is this an official Supabase tool?

No, this is a community-built tool. It uses official Supabase APIs and PostgreSQL tools.

### Can I use this in production?

Yes, but always test thoroughly first. The tool is designed for production use, but you should:
- Test backups and restores on a staging environment first
- Verify backups regularly
- Store backups securely
- Have a disaster recovery plan

### How long does a backup take?

It depends on your data size:
- Small projects (< 1GB): 1-5 minutes
- Medium projects (1-10GB): 5-30 minutes
- Large projects (> 10GB): 30+ minutes

Storage files and large databases take longer.

## Setup & Configuration

### Where do I find my service role key?

1. Go to your Supabase project dashboard
2. Settings → API
3. Look for "service_role" under Project API keys
4. Click to reveal and copy

⚠️ **Important**: Use service_role, NOT anon key!

### What's the difference between service_role and anon key?

- **anon key**: Public key for client-side apps (limited permissions)
- **service_role**: Admin key with full access (required for backups)

Never expose the service_role key in client-side code!

### How do I find my database password?

1. Settings → Database
2. Look for "Database Password"
3. If you forgot it, you can reset it (this will require updating your apps)

### Can I backup multiple projects?

Yes! Create separate `.env` files or use environment variables:

```bash
# Backup project 1
SUPABASE_URL=https://project1.supabase.co python cli.py backup

# Backup project 2
SUPABASE_URL=https://project2.supabase.co python cli.py backup
```

## Backup Questions

### What's included in a backup?

**Database:**
- All tables in the public schema
- Table schemas and constraints
- Indexes
- Data in SQL and JSON formats

**Storage:**
- All buckets and their configurations
- All files with directory structure preserved

**Auth:**
- User accounts
- User metadata
- App metadata
- Email and phone (if present)

### What's NOT included?

- Edge Functions (planned for future)
- Realtime configuration
- API keys (security reasons)
- Webhooks configuration
- Custom domain settings

### Can I do partial backups?

Yes! Use flags to skip components:

```bash
# Database only
python cli.py backup --no-storage --no-auth

# Database + Storage (no auth)
python cli.py backup --no-auth
```

### How much disk space do I need?

Roughly 1.5-2x your Supabase project size:
- Database: ~1x size (SQL dump)
- Storage: ~1x size (files)
- JSON exports: ~0.5x size (optional)

### Can I backup to cloud storage?

Not directly yet, but you can:
1. Create backup locally
2. Upload to S3/GCS/Azure using their CLI tools

Example with AWS S3:
```bash
python cli.py backup
aws s3 sync ./backups s3://my-backup-bucket/
```

### How do I automate backups?

Use cron (Linux/macOS) or Task Scheduler (Windows):

```bash
# Daily at 2 AM
0 2 * * * cd /path/to/supapy && python cli.py backup

# Every 6 hours
0 */6 * * * cd /path/to/supapy && python cli.py backup
```

## Restore Questions

### Will restore overwrite my data?

Yes! Restore will overwrite existing data. Always:
- Confirm you're restoring to the correct project
- Backup current data before restoring
- Test on a staging environment first

### Can I restore to a different project?

Yes! Just configure `.env` with the target project's credentials and restore.

### Can I restore specific tables only?

Not directly through the CLI, but you can:
1. Use the JSON exports in `tables_json/`
2. Write a custom script to restore specific tables
3. Manually edit the SQL dump file

### What if restore fails?

The tool provides detailed error messages. Common issues:
- Permission errors: Check your service_role key
- Connection errors: Verify database URL
- Constraint violations: May need to restore in specific order

Check the error message and fix the underlying issue.

### How do I verify a restore worked?

```bash
python cli.py verify /path/to/backup
```

This checks:
- Database tables exist
- Storage buckets exist
- Auth users exist

### Can I restore an old backup to a newer Supabase version?

Usually yes, but:
- Schema changes may cause issues
- New features won't be in old backups
- Test thoroughly before production restore

## Technical Questions

### Why do I need PostgreSQL tools?

`pg_dump` and `psql` are the standard tools for PostgreSQL backup/restore. They're:
- Reliable and battle-tested
- Support all PostgreSQL features
- Efficient for large databases

### Can I use this without PostgreSQL tools?

Partially. You can:
- Use JSON exports (but no schema backup)
- Backup storage and auth
- But you'll miss database schema and constraints

### What Python version do I need?

Python 3.8 or higher. Check with:
```bash
python3 --version
```

### Does this work on Windows?

Yes, but you need to:
1. Install Python 3.8+
2. Install PostgreSQL client tools
3. Use Windows paths in configuration

### How secure are my backups?

Backups contain:
- All your data (unencrypted by default)
- Database credentials are NOT in backups
- Auth passwords are hashed

**Security recommendations:**
- Store backups in encrypted storage
- Limit access to backup files
- Don't commit backups to version control
- Use secure transfer methods

### Can I encrypt backups?

Not built-in yet, but you can:

```bash
# After backup, encrypt with gpg
python cli.py backup
tar -czf backup.tar.gz ./backups/backup_*
gpg -c backup.tar.gz

# Decrypt when needed
gpg -d backup.tar.gz.gpg | tar -xzf -
```

## Performance Questions

### How can I speed up backups?

- Skip storage if you have large files: `--no-storage`
- Skip auth if you have many users: `--no-auth`
- Use faster disk (SSD)
- Ensure good network connection

### Why is storage backup slow?

Storage backup downloads every file individually. Large files or many files take time.

Future versions may support:
- Parallel downloads
- Compression
- Incremental backups

### Can I run backups in parallel?

Not recommended. Multiple simultaneous backups may:
- Overload your database
- Cause rate limiting
- Create inconsistent backups

## Troubleshooting

### "pg_dump: command not found"

Install PostgreSQL client tools:
- macOS: `brew install postgresql`
- Ubuntu: `sudo apt-get install postgresql-client`
- Windows: Download from postgresql.org

### "Permission denied" errors

Check:
- Using service_role key (not anon key)
- Key is correct and not expired
- Project URL is correct

### "Connection refused" for database

Check:
- Database URL is correct
- Password is correct (no special characters causing issues)
- IP is allowed (check Supabase database settings)

### "No module named 'supabase'"

Install dependencies:
```bash
pip install -r requirements.txt
```

### Backup succeeds but files are missing

Check:
- Permissions on backup directory
- Disk space available
- Error messages in output

### Restore partially works

Some components may fail while others succeed. Check:
- Error messages for specific failures
- Verify what was restored: `python cli.py verify`
- Retry failed components individually

## Best Practices

### How often should I backup?

Depends on your data change frequency:
- High activity: Every 6-12 hours
- Medium activity: Daily
- Low activity: Weekly

### How many backups should I keep?

Recommended retention:
- Last 7 daily backups
- Last 4 weekly backups
- Last 12 monthly backups

### Should I test restores?

Yes! Regularly test restores to ensure:
- Backups are valid
- Restore process works
- You know the procedure

Test monthly on a staging environment.

### Where should I store backups?

Best practices:
- **Local**: Fast access, but single point of failure
- **Cloud**: S3/GCS/Azure for durability
- **Both**: Local + cloud for redundancy

Never store backups only on the same server as your database!

## Getting Help

### Where can I get support?

1. Check this FAQ
2. Read the [README.md](README.md)
3. Review [GETTING_STARTED.md](GETTING_STARTED.md)
4. Check error messages carefully
5. Open an issue on GitHub

### How do I report a bug?

Include:
- Error message
- Command you ran
- Python version
- OS version
- Supabase project size (approximate)

### Can I contribute?

Yes! Contributions welcome:
- Bug fixes
- New features
- Documentation improvements
- Test coverage

See the roadmap in [README.md](README.md) for planned features.

---

**Still have questions?** Open an issue or check the documentation!
