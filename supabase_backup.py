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
        
    def create_backup(self, include_storage: bool = True, include_auth: bool = True) -> str:
        """
        Create a full backup of Supabase project
        
        Args:
            include_storage: Whether to backup storage files
            include_auth: Whether to backup auth users
            
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
        
        # Create metadata file
        self._create_metadata(backup_path, include_storage, include_auth)
        
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
    
    def _create_metadata(self, backup_path: Path, include_storage: bool, include_auth: bool):
        """Create metadata file for the backup"""
        metadata = {
            'timestamp': datetime.now().isoformat(),
            'supabase_url': self.supabase_url,
            'include_storage': include_storage,
            'include_auth': include_auth,
            'backup_version': '1.0'
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
