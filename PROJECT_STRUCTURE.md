# Project Structure

```
supapy/
│
├── README.md                   # Main documentation
├── QUICKSTART.md              # Quick start guide
├── PROJECT_STRUCTURE.md       # This file
├── LICENSE                    # MIT License
│
├── requirements.txt           # Python dependencies
├── setup.py                   # Package installation script
├── .env.example              # Environment variables template
├── .env                      # Your actual config (gitignored)
├── .gitignore               # Git ignore rules
│
├── supabase_backup.py       # Backup functionality
├── supabase_restore.py      # Restore functionality
├── cli.py                   # Command-line interface
├── example_usage.py         # Usage examples
├── test_connection.py       # Connection test script
│
└── backups/                 # Backup storage (gitignored)
    └── backup_YYYYMMDD_HHMMSS/
        ├── metadata.json
        ├── database.sql
        ├── tables_json/
        │   ├── table1.json
        │   └── table2.json
        ├── storage/
        │   ├── buckets_metadata.json
        │   ├── bucket1/
        │   └── bucket2/
        └── auth_users.json
```

## File Descriptions

### Core Modules

- **supabase_backup.py**: Contains the `SupabaseBackup` class with methods for:
  - Creating full backups
  - Backing up database (SQL dump + JSON)
  - Backing up storage files
  - Backing up auth users
  - Listing available backups

- **supabase_restore.py**: Contains the `SupabaseRestore` class with methods for:
  - Restoring full backups
  - Restoring database from SQL
  - Restoring storage files
  - Restoring auth users
  - Verifying restore operations

- **cli.py**: Command-line interface providing:
  - `backup` - Create backups
  - `restore` - Restore backups
  - `list` - List available backups
  - `verify` - Verify restore
  - `config` - Show configuration

### Configuration

- **.env.example**: Template for environment variables
- **.env**: Your actual configuration (never commit this!)
- **requirements.txt**: Python package dependencies

### Documentation

- **README.md**: Complete documentation with features, installation, usage
- **QUICKSTART.md**: 5-minute getting started guide
- **PROJECT_STRUCTURE.md**: This file - project organization
- **LICENSE**: MIT License

### Utilities

- **example_usage.py**: Demonstrates programmatic usage
- **test_connection.py**: Tests all connections before backup
- **setup.py**: Makes the package installable via pip

## Backup Structure

Each backup creates a timestamped directory containing:

1. **metadata.json**: Backup information
   - Timestamp
   - Source URL
   - Components included

2. **database.sql**: PostgreSQL dump
   - Full schema
   - All data
   - Indexes and constraints

3. **tables_json/**: Individual table exports
   - Each table as a JSON file
   - Easier to inspect/modify
   - Alternative restore method

4. **storage/**: Storage files
   - buckets_metadata.json (bucket configuration)
   - Subdirectories for each bucket
   - All files preserved with structure

5. **auth_users.json**: Authentication data
   - User accounts
   - Metadata
   - App metadata

## Dependencies

### Python Packages

- **supabase**: Official Supabase Python client
- **psycopg2-binary**: PostgreSQL adapter
- **python-dotenv**: Environment variable management
- **click**: CLI framework
- **requests**: HTTP library
- **tqdm**: Progress bars
- **tabulate**: Table formatting

### System Requirements

- **PostgreSQL client tools** (pg_dump, psql)
- **Python 3.8+**

## Usage Patterns

### CLI Usage
```bash
python cli.py [command] [options]
```

### Programmatic Usage
```python
from supabase_backup import SupabaseBackup
from supabase_restore import SupabaseRestore

# Create instances and use methods
```

### Testing
```bash
python test_connection.py
```

## Data Flow

### Backup Flow
```
Supabase Project
    ↓
[SupabaseBackup]
    ↓
├─→ Database (pg_dump) → database.sql
├─→ Tables (SQL) → tables_json/*.json
├─→ Storage (API) → storage/*
└─→ Auth (API) → auth_users.json
    ↓
backup_YYYYMMDD_HHMMSS/
```

### Restore Flow
```
backup_YYYYMMDD_HHMMSS/
    ↓
[SupabaseRestore]
    ↓
├─→ database.sql (psql) → Database
├─→ storage/* (API) → Storage Buckets
└─→ auth_users.json (API) → Auth Users
    ↓
Supabase Project
```

## Security Notes

- `.env` is gitignored (contains secrets)
- `backups/` is gitignored (contains data)
- Service role key required (admin access)
- Backups should be stored securely
- Never commit credentials to version control

## Extensibility

The modular design allows easy extension:

- Add new backup sources (Edge Functions, etc.)
- Implement custom storage backends
- Add encryption layer
- Implement incremental backups
- Add compression
- Integrate with cloud storage

## Best Practices

1. **Regular Backups**: Schedule automated backups
2. **Test Restores**: Periodically test restore process
3. **Secure Storage**: Encrypt and secure backup files
4. **Version Control**: Keep backup tool updated
5. **Documentation**: Document your backup strategy
