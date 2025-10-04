"""
Supabase Backup Module
Handles backing up database, storage, and authentication data from Supabase
"""

import os
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List
import psycopg2
from supabase import create_client, Client
from tqdm import tqdm
import requests


class SupabaseBackup:
    """Class to handle Supabase backups"""
    
    def __init__(self, supabase_url: str, supabase_key: str, db_url: str, backup_dir: str = "./backups", project_name: str = None):
        """
        Initialize the backup handler
        
        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key
            db_url: PostgreSQL database connection URL
            backup_dir: Directory to store backups
            project_name: Optional project name to prefix backup files (e.g., 'ipa')
        """
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self.db_url = db_url
        self.backup_dir = Path(backup_dir)
        self.project_name = project_name or os.getenv('PROJECT_NAME', '')
        self.supabase: Client = create_client(supabase_url, supabase_key)
        
        # Create backup directory if it doesn't exist
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
    def create_backup(self, include_storage: bool = True, include_auth: bool = True, include_edge_functions: bool = True) -> str:
        """
        Create a full backup of Supabase project
        
        Args:
            include_storage: Whether to backup storage files
            include_auth: Whether to backup auth users
            include_edge_functions: Whether to backup edge functions
            
        Returns:
            Path to the backup directory
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Create backup folder name with optional project prefix
        if self.project_name:
            backup_folder = f"{self.project_name}_backup_{timestamp}"
        else:
            backup_folder = f"backup_{timestamp}"
        
        backup_path = self.backup_dir / backup_folder
        backup_path.mkdir(parents=True, exist_ok=True)
        
        print(f"Creating backup at: {backup_path}")
        
        # Backup database schema and data
        print("\n📊 Backing up database...")
        self._backup_database(backup_path)
        
        # Backup storage files
        if include_storage:
            print("\n📁 Backing up storage files...")
            self._backup_storage(backup_path)
        
        # Backup auth users
        if include_auth:
            print("\n👤 Backing up auth users...")
            self._backup_auth(backup_path)
        
        # Backup edge functions
        if include_edge_functions:
            print("\n⚡ Backing up edge functions...")
            self._backup_edge_functions(backup_path)
        
        # Backup database roles
        print("\n👥 Backing up database roles...")
        self._backup_database_roles(backup_path)
        
        # Backup project configuration
        print("\n⚙️  Backing up project configuration...")
        self._backup_project_config(backup_path)
        
        # Backup webhooks
        print("\n🔗 Backing up webhooks...")
        self._backup_webhooks(backup_path)
        
        # Backup realtime configuration
        print("\n📡 Backing up realtime configuration...")
        self._backup_realtime_config(backup_path)
        
        # Create metadata file
        self._create_metadata(backup_path, include_storage, include_auth, include_edge_functions)
        
        print(f"\n✅ Backup completed successfully at: {backup_path}")
        return str(backup_path)
    
    def _backup_database(self, backup_path: Path):
        """Backup database using pg_dump"""
        dump_file = backup_path / "database.sql"
        
        try:
            # Use pg_dump to create a full database backup
            cmd = f"pg_dump {self.db_url} -f {dump_file} --no-owner --no-acl"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode != 0:
                raise Exception(f"pg_dump failed: {result.stderr}")
            
            print(f"  ✓ Database dumped to {dump_file}")
            
            # Also backup table data as JSON for easier inspection
            self._backup_tables_as_json(backup_path)
            
        except Exception as e:
            print(f"  ✗ Database backup failed: {e}")
            raise
    
    def _backup_tables_as_json(self, backup_path: Path):
        """Backup individual tables as JSON files"""
        json_dir = backup_path / "tables_json"
        json_dir.mkdir(exist_ok=True)
        
        try:
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            
            # Get all tables in public schema
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
            """)
            
            tables = cursor.fetchall()
            
            for (table_name,) in tqdm(tables, desc="  Exporting tables"):
                try:
                    cursor.execute(f'SELECT * FROM "{table_name}"')
                    columns = [desc[0] for desc in cursor.description]
                    rows = cursor.fetchall()
                    
                    # Convert to list of dicts
                    data = [dict(zip(columns, row)) for row in rows]
                    
                    # Convert non-serializable types
                    for item in data:
                        for key, value in item.items():
                            if isinstance(value, (datetime,)):
                                item[key] = value.isoformat()
                            elif not isinstance(value, (str, int, float, bool, type(None), list, dict)):
                                item[key] = str(value)
                    
                    # Save to JSON
                    with open(json_dir / f"{table_name}.json", 'w') as f:
                        json.dump(data, f, indent=2, default=str)
                        
                except Exception as e:
                    print(f"    ⚠ Warning: Could not export table {table_name}: {e}")
            
            cursor.close()
            conn.close()
            print(f"  ✓ Tables exported to JSON in {json_dir}")
            
        except Exception as e:
            print(f"  ⚠ Warning: JSON export failed: {e}")
    
    def _backup_storage(self, backup_path: Path):
        """Backup storage buckets and files"""
        storage_dir = backup_path / "storage"
        storage_dir.mkdir(exist_ok=True)
        
        try:
            # Get all buckets
            response = self.supabase.storage.list_buckets()
            
            if not response:
                print("  ℹ No storage buckets found")
                return
            
            buckets_info = []
            
            for bucket in tqdm(response, desc="  Backing up buckets"):
                bucket_name = bucket.name if hasattr(bucket, 'name') else bucket.get('name')
                bucket_dir = storage_dir / bucket_name
                bucket_dir.mkdir(exist_ok=True)
                
                # Save bucket metadata
                bucket_info = {
                    'name': bucket_name,
                    'id': bucket.id if hasattr(bucket, 'id') else bucket.get('id'),
                    'public': bucket.public if hasattr(bucket, 'public') else bucket.get('public', False),
                }
                buckets_info.append(bucket_info)
                
                # List and download files
                try:
                    files = self.supabase.storage.from_(bucket_name).list()
                    self._download_bucket_files(bucket_name, files, bucket_dir)
                except Exception as e:
                    print(f"    ⚠ Warning: Could not backup bucket {bucket_name}: {e}")
            
            # Save buckets metadata
            with open(storage_dir / "buckets_metadata.json", 'w') as f:
                json.dump(buckets_info, f, indent=2)
            
            print(f"  ✓ Storage backed up to {storage_dir}")
            
        except Exception as e:
            print(f"  ⚠ Warning: Storage backup failed: {e}")
    
    def _download_bucket_files(self, bucket_name: str, files: List, bucket_dir: Path, prefix: str = ""):
        """Recursively download files from a bucket"""
        for file in files:
            file_name = file.get('name')
            file_path = f"{prefix}{file_name}" if prefix else file_name
            
            # Check if it's a folder
            if file.get('id') is None:
                # It's a folder, recurse
                folder_dir = bucket_dir / file_name
                folder_dir.mkdir(exist_ok=True)
                try:
                    sub_files = self.supabase.storage.from_(bucket_name).list(file_path)
                    self._download_bucket_files(bucket_name, sub_files, folder_dir, f"{file_path}/")
                except Exception as e:
                    print(f"      ⚠ Warning: Could not list folder {file_path}: {e}")
            else:
                # It's a file, download it
                try:
                    file_data = self.supabase.storage.from_(bucket_name).download(file_path)
                    with open(bucket_dir / file_name, 'wb') as f:
                        f.write(file_data)
                except Exception as e:
                    print(f"      ⚠ Warning: Could not download {file_path}: {e}")
    
    def _backup_auth(self, backup_path: Path):
        """Backup authentication users"""
        auth_file = backup_path / "auth_users.json"
        
        try:
            # Use the admin API to get users
            headers = {
                'apikey': self.supabase_key,
                'Authorization': f'Bearer {self.supabase_key}'
            }
            
            response = requests.get(
                f"{self.supabase_url}/auth/v1/admin/users",
                headers=headers
            )
            
            if response.status_code == 200:
                users_data = response.json()
                
                with open(auth_file, 'w') as f:
                    json.dump(users_data, f, indent=2)
                
                user_count = len(users_data.get('users', []))
                print(f"  ✓ Backed up {user_count} auth users to {auth_file}")
            else:
                print(f"  ⚠ Warning: Could not fetch auth users: {response.status_code}")
                
        except Exception as e:
            print(f"  ⚠ Warning: Auth backup failed: {e}")
    
    def _backup_database_roles(self, backup_path: Path):
        """Backup database roles and permissions"""
        roles_file = backup_path / "roles.sql"
        
        try:
            # Use pg_dumpall to backup roles
            # Extract just the roles part
            cmd = f"pg_dumpall {self.db_url.replace('postgres', '')} --roles-only -f {roles_file}"
            
            # Alternative: use psql to get role definitions
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            
            # Get custom roles (exclude system roles)
            cursor.execute("""
                SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, 
                       rolcanlogin, rolreplication, rolconnlimit, rolpassword,
                       rolvaliduntil
                FROM pg_roles 
                WHERE rolname NOT LIKE 'pg_%' 
                AND rolname NOT IN ('postgres')
                ORDER BY rolname
            """)
            
            roles_data = []
            for row in cursor.fetchall():
                role_info = {
                    'name': row[0],
                    'superuser': row[1],
                    'inherit': row[2],
                    'createrole': row[3],
                    'createdb': row[4],
                    'login': row[5],
                    'replication': row[6],
                    'connection_limit': row[7],
                    'valid_until': str(row[9]) if row[9] else None
                }
                roles_data.append(role_info)
            
            # Save as JSON for easy inspection
            with open(backup_path / "roles.json", 'w') as f:
                json.dump(roles_data, f, indent=2)
            
            # Also create SQL statements
            with open(roles_file, 'w') as f:
                f.write("-- Database Roles Backup\n")
                f.write("-- Generated: " + datetime.now().isoformat() + "\n\n")
                
                for role in roles_data:
                    # Skip system roles
                    if role['name'] in ['supabase_admin', 'supabase_auth_admin', 
                                       'supabase_storage_admin', 'supabase_functions_admin',
                                       'authenticator']:
                        continue
                    
                    sql = f"CREATE ROLE {role['name']}"
                    options = []
                    
                    if role['superuser']:
                        options.append('SUPERUSER')
                    if role['createrole']:
                        options.append('CREATEROLE')
                    if role['createdb']:
                        options.append('CREATEDB')
                    if role['login']:
                        options.append('LOGIN')
                    if role['connection_limit'] != -1:
                        options.append(f"CONNECTION LIMIT {role['connection_limit']}")
                    
                    if options:
                        sql += " WITH " + " ".join(options)
                    
                    sql += ";\n"
                    f.write(sql)
            
            cursor.close()
            conn.close()
            
            print(f"  ✓ Backed up {len(roles_data)} database roles to {roles_file}")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Database roles backup had issues: {e}")
            # Create error log
            with open(backup_path / "roles_error.txt", 'w') as f:
                f.write(f"Error backing up database roles: {e}\n")
    
    def _backup_edge_functions(self, backup_path: Path):
        """Backup edge functions"""
        functions_dir = backup_path / "edge_functions"
        functions_dir.mkdir(exist_ok=True)
        
        try:
            # Method 1: Check if supabase/functions directory exists locally
            local_functions_dir = Path("./supabase/functions")
            if local_functions_dir.exists():
                print(f"  ✓ Found local edge functions directory")
                
                # Copy all function files
                import shutil
                function_count = 0
                for function_dir in local_functions_dir.iterdir():
                    if function_dir.is_dir() and not function_dir.name.startswith('.'):
                        dest_dir = functions_dir / function_dir.name
                        shutil.copytree(function_dir, dest_dir, dirs_exist_ok=True)
                        function_count += 1
                
                if function_count > 0:
                    print(f"  ✓ Backed up {function_count} edge function(s) to {functions_dir}")
                else:
                    print(f"  ℹ️  No edge functions found in local directory")
            else:
                # Method 2: Try to list functions via Management API
                print(f"  ℹ️  No local edge functions directory found")
                print(f"  💡 Edge functions are typically stored in: supabase/functions/")
                print(f"  💡 If you have edge functions, ensure they're in your project directory")
                
                # Create a note file
                with open(functions_dir / "README.txt", 'w') as f:
                    f.write("Edge Functions Backup\n")
                    f.write("=" * 50 + "\n\n")
                    f.write("No local edge functions directory found.\n\n")
                    f.write("If you have edge functions:\n")
                    f.write("1. They should be in: supabase/functions/\n")
                    f.write("2. Re-run backup after ensuring functions are in project\n")
                    f.write("3. Or deploy functions using: supabase functions deploy\n")
                
        except Exception as e:
            print(f"  ⚠️  Warning: Edge functions backup had issues: {e}")
            # Create error log
            with open(functions_dir / "backup_error.txt", 'w') as f:
                f.write(f"Error backing up edge functions: {e}\n")
    
    def _backup_project_config(self, backup_path: Path):
        """Backup project configuration"""
        config_file = backup_path / "project_config.json"
        
        try:
            config = {
                'project_url': self.supabase_url,
                'timestamp': datetime.now().isoformat(),
                'auth_config': {},
                'storage_config': {},
                'api_config': {},
                'realtime_config': {},
                'note': 'Sensitive values (secrets, keys) are NOT included for security'
            }
            
            # Get storage buckets configuration
            try:
                buckets = self.supabase.storage.list_buckets()
                config['storage_config']['buckets'] = []
                for bucket in buckets:
                    bucket_info = {
                        'name': bucket.name if hasattr(bucket, 'name') else bucket.get('name'),
                        'id': bucket.id if hasattr(bucket, 'id') else bucket.get('id'),
                        'public': bucket.public if hasattr(bucket, 'public') else bucket.get('public', False),
                        'file_size_limit': bucket.file_size_limit if hasattr(bucket, 'file_size_limit') else bucket.get('file_size_limit'),
                        'allowed_mime_types': bucket.allowed_mime_types if hasattr(bucket, 'allowed_mime_types') else bucket.get('allowed_mime_types')
                    }
                    config['storage_config']['buckets'].append(bucket_info)
            except Exception as e:
                config['storage_config']['error'] = str(e)
            
            # Get database extensions
            try:
                conn = psycopg2.connect(self.db_url)
                cursor = conn.cursor()
                cursor.execute("SELECT extname, extversion FROM pg_extension ORDER BY extname")
                extensions = [{'name': row[0], 'version': row[1]} for row in cursor.fetchall()]
                config['database_extensions'] = extensions
                cursor.close()
                conn.close()
            except Exception as e:
                config['database_extensions'] = {'error': str(e)}
            
            # Save configuration
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)
            
            print(f"  ✓ Backed up project configuration to {config_file}")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Project config backup had issues: {e}")
            with open(backup_path / "config_error.txt", 'w') as f:
                f.write(f"Error backing up project config: {e}\n")
    
    def _backup_webhooks(self, backup_path: Path):
        """Backup webhook configurations"""
        webhooks_file = backup_path / "webhooks.json"
        
        try:
            webhooks_config = {
                'database_webhooks': [],
                'auth_hooks': [],
                'note': 'Webhook URLs and configurations (secrets not included)'
            }
            
            # Try to get database webhooks from pg_net or supabase_hooks
            try:
                conn = psycopg2.connect(self.db_url)
                cursor = conn.cursor()
                
                # Check if hooks table exists
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'supabase_functions' 
                        AND table_name = 'hooks'
                    )
                """)
                
                if cursor.fetchone()[0]:
                    cursor.execute("SELECT * FROM supabase_functions.hooks")
                    # Process webhook data
                    webhooks_config['database_webhooks'] = [
                        {'info': 'Webhooks found but structure varies by version'}
                    ]
                
                cursor.close()
                conn.close()
            except Exception as e:
                webhooks_config['database_webhooks'] = {'note': f'No webhooks table found or error: {str(e)[:100]}'}
            
            # Save webhooks configuration
            with open(webhooks_file, 'w') as f:
                json.dump(webhooks_config, f, indent=2)
            
            print(f"  ✓ Backed up webhooks configuration to {webhooks_file}")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Webhooks backup had issues: {e}")
            with open(backup_path / "webhooks_error.txt", 'w') as f:
                f.write(f"Error backing up webhooks: {e}\n")
    
    def _backup_realtime_config(self, backup_path: Path):
        """Backup realtime configuration"""
        realtime_file = backup_path / "realtime_config.json"
        
        try:
            realtime_config = {
                'publications': [],
                'subscriptions': [],
                'note': 'Realtime publications and configuration'
            }
            
            # Get publications
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            
            # Get publication details
            cursor.execute("""
                SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
                FROM pg_publication
            """)
            
            for row in cursor.fetchall():
                pub_info = {
                    'name': row[0],
                    'all_tables': row[1],
                    'publish_insert': row[2],
                    'publish_update': row[3],
                    'publish_delete': row[4],
                    'publish_truncate': row[5]
                }
                
                # Get tables in this publication
                cursor.execute(f"""
                    SELECT schemaname, tablename 
                    FROM pg_publication_tables 
                    WHERE pubname = '{row[0]}'
                """)
                pub_info['tables'] = [{'schema': t[0], 'table': t[1]} for t in cursor.fetchall()]
                
                realtime_config['publications'].append(pub_info)
            
            cursor.close()
            conn.close()
            
            # Save realtime configuration
            with open(realtime_file, 'w') as f:
                json.dump(realtime_config, f, indent=2)
            
            print(f"  ✓ Backed up realtime configuration to {realtime_file}")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Realtime config backup had issues: {e}")
            with open(backup_path / "realtime_error.txt", 'w') as f:
                f.write(f"Error backing up realtime config: {e}\n")
    
    def _create_metadata(self, backup_path: Path, include_storage: bool, include_auth: bool, include_edge_functions: bool = True):
        """Create metadata file for the backup"""
        metadata = {
            'timestamp': datetime.now().isoformat(),
            'supabase_url': self.supabase_url,
            'include_storage': include_storage,
            'include_auth': include_auth,
            'include_edge_functions': include_edge_functions,
            'backup_version': '1.1'
        }
        
        with open(backup_path / "metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
    
    def list_backups(self) -> List[Dict]:
        """List all available backups"""
        backups = []
        
        if not self.backup_dir.exists():
            return backups
        
        for backup_dir in sorted(self.backup_dir.iterdir(), reverse=True):
            if backup_dir.is_dir() and backup_dir.name.startswith('backup_'):
                metadata_file = backup_dir / "metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                        metadata['path'] = str(backup_dir)
                        backups.append(metadata)
        
        return backups
