# Changelog

All notable changes to the Supabase Backup & Restore Tool will be documented in this file.

## [1.0.0] - 2024-10-04

### Added
- Initial release of Supabase Backup & Restore Tool
- Full database backup using pg_dump
- Database export to JSON format for individual tables
- Storage bucket backup with file downloads
- Authentication users backup
- Complete restore functionality for all components
- CLI interface with commands: backup, restore, list, verify, config
- Programmatic API for Python integration
- Progress bars for long-running operations
- Backup verification system
- Comprehensive documentation (README, QUICKSTART, PROJECT_STRUCTURE)
- Example usage scripts
- Connection test utility
- Environment variable configuration
- Metadata tracking for backups
- Support for partial backups (database-only, etc.)
- Interactive confirmation prompts for restore operations
- Backup listing with formatted output

### Features
- ✅ PostgreSQL database backup and restore
- ✅ Supabase Storage backup and restore
- ✅ Authentication users backup and restore
- ✅ JSON export of database tables
- ✅ Recursive storage file handling
- ✅ Bucket metadata preservation
- ✅ User metadata and app metadata backup
- ✅ Command-line interface
- ✅ Programmatic Python API
- ✅ Backup verification
- ✅ Progress indicators
- ✅ Error handling and warnings
- ✅ Configurable backup directory
- ✅ Latest backup auto-selection

### Dependencies
- supabase==2.3.4
- python-dotenv==1.0.0
- click==8.1.7
- psycopg2-binary==2.9.9
- requests==2.31.0
- tqdm==4.66.1
- tabulate==0.9.0

### Requirements
- Python 3.8+
- PostgreSQL client tools (pg_dump, psql)

## [Unreleased]

### Planned Features
- Edge Functions backup and restore
- Incremental backup support
- Backup compression (gzip)
- Cloud storage integration (S3, GCS, Azure)
- Backup encryption
- Scheduled backups with retention policies
- Web UI for backup management
- Backup diff/comparison tool
- Multi-project backup orchestration
- Backup size optimization
- Parallel backup operations
- Webhook notifications
- Backup health monitoring
- Automatic backup rotation
- Point-in-time recovery

### Known Limitations
- Edge Functions not yet supported
- Realtime configuration not backed up
- API keys not backed up (security)
- Very large files may timeout
- No incremental backup support yet
- No built-in compression yet
- No built-in encryption yet

---

For more information, see [README.md](README.md)
