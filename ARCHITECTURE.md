# Architecture & Design 🏗️

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backup & Restore                │
│                         Python Tool                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─── CLI Interface (cli.py)
                              │
                              ├─── Backup Engine (supabase_backup.py)
                              │
                              ├─── Restore Engine (supabase_restore.py)
                              │
                              └─── Utilities (test_connection.py, etc.)
```

## Component Architecture

```
┌──────────────────┐
│   User/Script    │
└────────┬─────────┘
         │
         ├─────────────────┐
         │                 │
    ┌────▼────┐      ┌────▼────────┐
    │   CLI   │      │  Python API │
    │ (Click) │      │   (Direct)  │
    └────┬────┘      └────┬────────┘
         │                │
         └────────┬───────┘
                  │
         ┌────────▼─────────┐
         │  Core Modules    │
         ├──────────────────┤
         │ SupabaseBackup   │
         │ SupabaseRestore  │
         └────────┬─────────┘
                  │
         ┌────────┴─────────┐
         │                  │
    ┌────▼────┐      ┌─────▼──────┐
    │ Supabase│      │ PostgreSQL │
    │   API   │      │   Tools    │
    └─────────┘      └────────────┘
```

## Data Flow Diagrams

### Backup Process

```
┌─────────────┐
│ User runs   │
│ backup cmd  │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ CLI validates    │
│ environment      │
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│          SupabaseBackup.create_backup()      │
└──────┬───────────────────────────────────────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐    ┌──────────────┐
│  Database   │    │   Storage    │
│   Backup    │    │    Backup    │
└──────┬──────┘    └──────┬───────┘
       │                  │
       ▼                  ▼
┌─────────────┐    ┌──────────────┐
│ pg_dump →   │    │ API calls →  │
│ SQL file    │    │ Download     │
└──────┬──────┘    │ files        │
       │           └──────┬───────┘
       ▼                  │
┌─────────────┐           │
│ psycopg2 →  │           │
│ JSON files  │           │
└──────┬──────┘           │
       │                  │
       └────────┬─────────┘
                │
                ▼
         ┌──────────────┐
         │  Auth Backup │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Admin API →  │
         │ User export  │
         └──────┬───────┘
                │
                ▼
         ┌──────────────────┐
         │ Create metadata  │
         │ & timestamp dir  │
         └──────┬───────────┘
                │
                ▼
         ┌──────────────┐
         │   Complete   │
         └──────────────┘
```

### Restore Process

```
┌─────────────┐
│ User runs   │
│ restore cmd │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ CLI validates    │
│ backup path      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Load & verify    │
│ metadata.json    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ User confirms    │
│ (if not --yes)   │
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│        SupabaseRestore.restore_backup()      │
└──────┬───────────────────────────────────────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐    ┌──────────────┐
│  Database   │    │   Storage    │
│   Restore   │    │   Restore    │
└──────┬──────┘    └──────┬───────┘
       │                  │
       ▼                  ▼
┌─────────────┐    ┌──────────────┐
│ psql ←      │    │ Create       │
│ SQL file    │    │ buckets      │
└──────┬──────┘    └──────┬───────┘
       │                  │
       │                  ▼
       │           ┌──────────────┐
       │           │ API calls ←  │
       │           │ Upload files │
       │           └──────┬───────┘
       │                  │
       └────────┬─────────┘
                │
                ▼
         ┌──────────────┐
         │ Auth Restore │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │ Admin API ←  │
         │ Create users │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │   Complete   │
         └──────────────┘
```

## Class Structure

### SupabaseBackup Class

```python
class SupabaseBackup:
    
    # Initialization
    __init__(url, key, db_url, backup_dir)
    
    # Public Methods
    create_backup(include_storage, include_auth) → str
    list_backups() → List[Dict]
    
    # Private Methods
    _backup_database(backup_path)
    _backup_tables_as_json(backup_path)
    _backup_storage(backup_path)
    _download_bucket_files(bucket, files, dir, prefix)
    _backup_auth(backup_path)
    _create_metadata(backup_path, ...)
```

### SupabaseRestore Class

```python
class SupabaseRestore:
    
    # Initialization
    __init__(url, key, db_url)
    
    # Public Methods
    restore_backup(path, restore_db, restore_storage, restore_auth, confirm)
    verify_restore(backup_path) → Dict
    
    # Private Methods
    _restore_database(backup_dir)
    _restore_database_from_json(backup_dir)
    _restore_storage(backup_dir)
    _upload_bucket_files(bucket, dir, prefix)
    _restore_auth(backup_dir)
```

## File System Structure

```
supapy/
│
├── Core Application
│   ├── supabase_backup.py      # Backup engine
│   ├── supabase_restore.py     # Restore engine
│   └── cli.py                  # CLI interface
│
├── Configuration
│   ├── .env                    # Secrets (gitignored)
│   ├── .env.example            # Template
│   ├── requirements.txt        # Dependencies
│   └── setup.py                # Package config
│
├── Utilities
│   ├── example_usage.py        # Examples
│   ├── test_connection.py      # Testing
│   └── run_backup.sh           # Quick script
│
├── Documentation
│   ├── README.md               # Main docs
│   ├── GETTING_STARTED.md      # Setup guide
│   ├── QUICKSTART.md           # Quick guide
│   ├── FAQ.md                  # Questions
│   ├── ARCHITECTURE.md         # This file
│   ├── PROJECT_STRUCTURE.md    # Organization
│   ├── PROJECT_SUMMARY.md      # Overview
│   └── CHANGELOG.md            # History
│
└── Backups (created at runtime)
    └── backup_YYYYMMDD_HHMMSS/
        ├── metadata.json
        ├── database.sql
        ├── tables_json/
        ├── storage/
        └── auth_users.json
```

## Technology Stack

```
┌─────────────────────────────────────┐
│         Application Layer           │
├─────────────────────────────────────┤
│  CLI (Click) │ Python API           │
└─────────────────────────────────────┘
                  │
┌─────────────────────────────────────┐
│         Business Logic              │
├─────────────────────────────────────┤
│  SupabaseBackup │ SupabaseRestore   │
└─────────────────────────────────────┘
                  │
┌─────────────────────────────────────┐
│         Integration Layer           │
├─────────────────────────────────────┤
│  Supabase SDK │ psycopg2 │ requests │
└─────────────────────────────────────┘
                  │
┌─────────────────────────────────────┐
│         External Services           │
├─────────────────────────────────────┤
│  Supabase API │ PostgreSQL │ Auth   │
└─────────────────────────────────────┘
```

## Dependency Graph

```
cli.py
  ├── supabase_backup.py
  │   ├── supabase (SDK)
  │   ├── psycopg2
  │   ├── requests
  │   ├── tqdm
  │   └── subprocess (pg_dump)
  │
  └── supabase_restore.py
      ├── supabase (SDK)
      ├── psycopg2
      ├── requests
      ├── tqdm
      └── subprocess (psql)
```

## Error Handling Strategy

```
┌─────────────────┐
│  User Action    │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  Input Validation   │
│  (CLI/API level)    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Environment Check  │
│  (Config validation)│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Connection Test    │
│  (Network/Auth)     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Operation Execute  │
│  (Try/Except blocks)│
└────────┬────────────┘
         │
         ├─── Success → Continue
         │
         └─── Error → Log & Report
                      │
                      ├─── Critical → Abort
                      └─── Warning → Continue
```

## Security Model

```
┌──────────────────────────────────┐
│        Security Layers           │
├──────────────────────────────────┤
│                                  │
│  1. Environment Variables        │
│     - No hardcoded secrets       │
│     - .env gitignored            │
│                                  │
│  2. Service Role Key             │
│     - Admin access required      │
│     - Masked in output           │
│                                  │
│  3. Backup Storage               │
│     - Local filesystem           │
│     - Gitignored directory       │
│     - User responsible for       │
│       encryption/security        │
│                                  │
│  4. Restore Confirmation         │
│     - Interactive prompts        │
│     - Explicit --yes flag        │
│                                  │
│  5. Connection Security          │
│     - HTTPS for API calls        │
│     - SSL for database           │
│                                  │
└──────────────────────────────────┘
```

## Performance Considerations

### Backup Performance

```
Database Size     Storage Size     Estimated Time
─────────────────────────────────────────────────
< 100 MB         < 1 GB           1-2 minutes
100 MB - 1 GB    1-10 GB          5-15 minutes
1 GB - 10 GB     10-50 GB         15-60 minutes
> 10 GB          > 50 GB          60+ minutes
```

### Optimization Strategies

1. **Parallel Operations** (Future)
   - Download storage files in parallel
   - Export tables concurrently

2. **Compression** (Future)
   - Compress backups with gzip
   - Reduce storage requirements

3. **Incremental Backups** (Future)
   - Only backup changed data
   - Faster subsequent backups

4. **Streaming** (Future)
   - Stream large files
   - Reduce memory usage

## Extension Points

The architecture supports easy extension:

```
Current:
  ├── Database
  ├── Storage
  └── Auth

Future:
  ├── Database
  ├── Storage
  ├── Auth
  ├── Edge Functions ← New
  ├── Realtime Config ← New
  └── Custom Extensions ← New
```

## Design Principles

1. **Modularity**
   - Separate backup/restore logic
   - Independent components
   - Easy to test

2. **Reliability**
   - Comprehensive error handling
   - Transaction-like operations
   - Verification capabilities

3. **Usability**
   - Simple CLI interface
   - Clear error messages
   - Progress indicators

4. **Extensibility**
   - Plugin architecture ready
   - Easy to add new sources
   - Configurable components

5. **Security**
   - No hardcoded secrets
   - Confirmation prompts
   - Secure defaults

## Testing Strategy

```
┌─────────────────────────────────┐
│      Testing Pyramid            │
├─────────────────────────────────┤
│                                 │
│         Manual Testing          │
│         (User testing)          │
│              ▲                  │
│              │                  │
│      Integration Tests          │
│      (test_connection.py)       │
│              ▲                  │
│              │                  │
│        Unit Tests               │
│        (Future)                 │
│                                 │
└─────────────────────────────────┘
```

## Deployment Model

```
Development:
  └── Local machine
      ├── Python environment
      ├── PostgreSQL tools
      └── .env configuration

Production:
  └── Server/Container
      ├── Cron job for scheduling
      ├── Secure backup storage
      └── Monitoring/alerting
```

## Future Architecture Enhancements

1. **Microservices** (Optional)
   - Backup service
   - Restore service
   - Verification service

2. **Queue System**
   - Background job processing
   - Retry mechanisms
   - Priority queues

3. **Web Interface**
   - Dashboard for backups
   - Restore management
   - Scheduling UI

4. **Cloud Integration**
   - S3/GCS storage
   - Cloud functions
   - Managed service

---

This architecture provides a solid foundation for reliable Supabase backups while remaining extensible for future enhancements.
