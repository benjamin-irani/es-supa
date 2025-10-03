# Installation Guide 📦

## Prerequisites

Before installing, ensure you have:

- **Python 3.8 or higher**
- **pip** (Python package manager)
- **PostgreSQL client tools** (pg_dump, psql)
- **A Supabase project**

## Installation Methods

### Method 1: Quick Install (Recommended)

```bash
# 1. Clone or download this repository
cd /path/to/supapy

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 4. Test installation
python test_connection.py
```

### Method 2: Virtual Environment (Best Practice)

```bash
# 1. Create virtual environment
python3 -m venv venv

# 2. Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 5. Test installation
python test_connection.py
```

### Method 3: System-wide Install (Advanced)

```bash
# Install as a package
pip install -e .

# Now you can use the command anywhere:
supabase-backup backup
supabase-backup restore --latest
```

## Installing PostgreSQL Tools

### macOS

```bash
# Using Homebrew
brew install postgresql

# Verify installation
pg_dump --version
psql --version
```

### Ubuntu/Debian

```bash
# Update package list
sudo apt-get update

# Install PostgreSQL client
sudo apt-get install postgresql-client

# Verify installation
pg_dump --version
psql --version
```

### Windows

1. Download PostgreSQL from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Run the installer
3. Select "Command Line Tools" during installation
4. Add PostgreSQL bin directory to PATH
5. Verify in Command Prompt:
   ```
   pg_dump --version
   psql --version
   ```

### Docker (Alternative)

```bash
# Use PostgreSQL Docker image
docker run --rm postgres:15 pg_dump --version
```

## Configuration

### 1. Get Supabase Credentials

Visit your Supabase project dashboard:

**Project URL:**
- Settings → API → Project URL
- Example: `https://abcdefghijk.supabase.co`

**Service Role Key:**
- Settings → API → service_role key
- ⚠️ Keep this secret!

**Database URL:**
- Settings → Database → Connection string (URI)
- Replace `[YOUR-PASSWORD]` with actual password
- Example: `postgresql://postgres:password@db.abcdefghijk.supabase.co:5432/postgres`

### 2. Create .env File

```bash
cp .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
BACKUP_DIR=./backups
```

### 3. Verify Installation

```bash
python test_connection.py
```

Expected output:
```
✅ PASS - Environment Variables
✅ PASS - PostgreSQL Tools
✅ PASS - Supabase API
✅ PASS - Database Connection
✅ PASS - Auth API

🎉 All tests passed! You're ready to create backups.
```

## Troubleshooting Installation

### Python Version Issues

```bash
# Check Python version
python --version
python3 --version

# Use python3 if python is < 3.8
python3 -m pip install -r requirements.txt
```

### Permission Errors

```bash
# On macOS/Linux, use --user flag
pip install --user -r requirements.txt

# Or use sudo (not recommended)
sudo pip install -r requirements.txt
```

### PostgreSQL Tools Not Found

**macOS:**
```bash
# Add to PATH in ~/.zshrc or ~/.bash_profile
export PATH="/usr/local/opt/postgresql/bin:$PATH"
```

**Linux:**
```bash
# Reinstall
sudo apt-get install --reinstall postgresql-client
```

**Windows:**
```
Add to System PATH:
C:\Program Files\PostgreSQL\15\bin
```

### Module Import Errors

```bash
# Ensure you're in the right directory
cd /path/to/supapy

# Reinstall dependencies
pip install --force-reinstall -r requirements.txt
```

### Connection Test Fails

**Check Environment Variables:**
```bash
python cli.py config
```

**Verify Credentials:**
- Ensure service_role key (not anon key)
- Check database password is correct
- Verify project URL has no trailing slash

## Upgrading

### Update Dependencies

```bash
# Pull latest changes
git pull

# Update packages
pip install --upgrade -r requirements.txt
```

### Migrate Configuration

Check [CHANGELOG.md](CHANGELOG.md) for breaking changes.

## Uninstalling

### Remove Package

```bash
# If installed with pip install -e .
pip uninstall supabase-backup-restore

# Remove virtual environment
rm -rf venv

# Remove backups (optional)
rm -rf backups
```

### Keep Backups

```bash
# Move backups before uninstalling
mv backups ~/supabase-backups-archive
```

## Next Steps

After successful installation:

1. ✅ Read [GETTING_STARTED.md](GETTING_STARTED.md)
2. ✅ Create your first backup: `python cli.py backup`
3. ✅ Review [QUICKSTART.md](QUICKSTART.md)
4. ✅ Explore [README.md](README.md)

## Platform-Specific Notes

### macOS

- Homebrew is the easiest way to install PostgreSQL
- Use `python3` instead of `python` if both are installed
- May need to allow terminal access in Security settings

### Linux

- PostgreSQL client is usually in default repositories
- May need sudo for system-wide installation
- Check firewall settings for database connection

### Windows

- Use PowerShell or Command Prompt
- Backslashes in paths: `C:\path\to\backups`
- May need to run as Administrator
- Line endings: Git should handle automatically

## Docker Installation (Alternative)

Create a `Dockerfile`:

```dockerfile
FROM python:3.11-slim

# Install PostgreSQL client
RUN apt-get update && \
    apt-get install -y postgresql-client && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy files
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create backup directory
RUN mkdir -p /backups

# Set environment
ENV BACKUP_DIR=/backups

ENTRYPOINT ["python", "cli.py"]
```

Build and run:

```bash
# Build image
docker build -t supabase-backup .

# Run backup
docker run --rm \
  -v $(pwd)/backups:/backups \
  -e SUPABASE_URL=your-url \
  -e SUPABASE_KEY=your-key \
  -e SUPABASE_DB_URL=your-db-url \
  supabase-backup backup
```

## Verification Checklist

- [ ] Python 3.8+ installed
- [ ] pip working
- [ ] PostgreSQL tools installed (pg_dump, psql)
- [ ] Dependencies installed
- [ ] .env file configured
- [ ] Connection test passes
- [ ] First backup successful

## Support

If installation fails:

1. Check error messages carefully
2. Review [FAQ.md](FAQ.md)
3. Run `python test_connection.py` for diagnostics
4. Ensure all prerequisites are met
5. Check platform-specific notes above

---

**Installation successful?** → Continue to [GETTING_STARTED.md](GETTING_STARTED.md)
