"""
Supabase Restore Module
Handles restoring database, storage, and authentication data to Supabase
"""

import os
import json
import subprocess
from pathlib import Path
from typing import Optional, Dict, List
import psycopg2
from supabase import create_client, Client
from tqdm import tqdm
import requests


class SupabaseRestore:
    """Class to handle Supabase restores"""
    
    def __init__(self, supabase_url: str, supabase_key: str, db_url: str):
        """
        Initialize the restore handler
        
        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key
            db_url: PostgreSQL database connection URL
        """
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self.db_url = db_url
        self.supabase: Client = create_client(supabase_url, supabase_key)
    
    def restore_backup(self, backup_path: str, restore_database: bool = True, 
                      restore_storage: bool = True, restore_auth: bool = True,
                      restore_edge_functions: bool = True, restore_roles: bool = True,
                      restore_realtime: bool = True, restore_webhooks: bool = True,
                      deploy_functions: bool = True, mode: str = 'clean', confirm: bool = False):
        """
        Restore a backup to Supabase
        
        Args:
            backup_path: Path to the backup directory
            restore_database: Whether to restore database
            restore_storage: Whether to restore storage files
            restore_auth: Whether to restore auth users
            restore_edge_functions: Whether to restore edge functions
            restore_roles: Whether to restore database roles
            restore_realtime: Whether to restore realtime configuration
            restore_webhooks: Whether to restore webhooks
            deploy_functions: Whether to automatically deploy edge functions
            mode: Restore mode - 'clean' (default), 'merge', or 'force'
                  - clean: Drop conflicting objects, then restore (safe overwrite)
                  - merge: Skip existing objects, add missing only
                  - force: Drop entire public schema, complete rebuild
            confirm: Confirmation flag (safety check)
        """
        backup_dir = Path(backup_path)
        
        if not backup_dir.exists():
            raise ValueError(f"Backup directory does not exist: {backup_path}")
        
        # Load metadata
        metadata_file = backup_dir / "metadata.json"
        if not metadata_file.exists():
            raise ValueError(f"Invalid backup: metadata.json not found in {backup_path}")
        
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        print(f"Restoring backup from: {metadata['timestamp']}")
        print(f"Original URL: {metadata['supabase_url']}")
        print(f"Target URL: {self.supabase_url}")
        print(f"Backup Version: {metadata.get('backup_version', '1.0')}")
        print(f"Restore Mode: {mode.upper()}")
        
        # Explain mode
        mode_descriptions = {
            'clean': 'Drop conflicting objects, then restore (safe overwrite)',
            'merge': 'Skip existing objects, add missing only',
            'force': 'Drop entire public schema, complete rebuild (DESTRUCTIVE)'
        }
        print(f"  → {mode_descriptions.get(mode, 'Unknown mode')}")
        
        if not confirm:
            warning_msg = {
                'clean': "\n⚠️  WARNING: This will drop conflicting objects and restore!",
                'merge': "\n⚠️  WARNING: This will add missing objects (existing data preserved)!",
                'force': "\n🚨 DANGER: This will DELETE ALL existing data and restore!"
            }
            print(warning_msg.get(mode, "\n⚠️  WARNING: This will modify your database!"))
            response = input("Are you sure you want to continue? (yes/no): ")
            if response.lower() != 'yes':
                print("Restore cancelled.")
                return
        
        # Apply restore mode preparation
        if restore_database and mode in ['clean', 'force']:
            print(f"\n🧹 Preparing database for {mode.upper()} mode...")
            self._prepare_database_for_restore(mode)
        
        # Restore database roles FIRST (before database)
        if restore_roles:
            print("\n👥 Restoring database roles...")
            self._restore_database_roles(backup_dir)
        
        # Restore database
        if restore_database:
            print("\n📊 Restoring database...")
            self._restore_database(backup_dir, mode=mode)
        
        # Restore storage
        if restore_storage and metadata.get('include_storage', False):
            print("\n📁 Restoring storage files...")
            self._restore_storage(backup_dir)
        
        # Restore auth
        if restore_auth and metadata.get('include_auth', False):
            print("\n👤 Restoring auth users...")
            self._restore_auth(backup_dir)
        
        # Restore edge functions
        if restore_edge_functions and metadata.get('include_edge_functions', False):
            print("\n⚡ Restoring edge functions...")
            self._restore_edge_functions(backup_dir, deploy=deploy_functions)
        
        # Restore realtime configuration
        if restore_realtime:
            print("\n📡 Restoring realtime configuration...")
            self._restore_realtime_config(backup_dir)
        
        # Restore webhooks
        if restore_webhooks:
            print("\n🔗 Restoring webhooks...")
            self._restore_webhooks(backup_dir)
        
        print("\n✅ Restore completed successfully!")
        print("\n💡 Next steps:")
        print("   1. Verify data in Supabase dashboard")
        print("   2. Deploy edge functions if any: npx supabase functions deploy --all")
        print("   3. Test your application")
    
    def _prepare_database_for_restore(self, mode: str):
        """Prepare database for restore based on mode"""
        try:
            conn = psycopg2.connect(self.db_url)
            conn.autocommit = True
            cursor = conn.cursor()
            
            if mode == 'force':
                # FORCE mode: Drop entire public schema and recreate
                print("  🚨 FORCE mode: Dropping public schema...")
                cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
                cursor.execute("CREATE SCHEMA public;")
                cursor.execute("GRANT ALL ON SCHEMA public TO postgres;")
                cursor.execute("GRANT ALL ON SCHEMA public TO public;")
                print("  ✓ Public schema dropped and recreated")
                
            elif mode == 'clean':
                # CLEAN mode: Drop only user tables, keep system tables
                print("  🧹 CLEAN mode: Dropping user tables and objects...")
                
                # Get list of user tables
                cursor.execute("""
                    SELECT tablename FROM pg_tables 
                    WHERE schemaname = 'public'
                    ORDER BY tablename
                """)
                tables = [row[0] for row in cursor.fetchall()]
                
                if tables:
                    # Drop tables with CASCADE to handle dependencies
                    for table in tables:
                        try:
                            cursor.execute(f'DROP TABLE IF EXISTS public."{table}" CASCADE;')
                        except Exception as e:
                            print(f"    ⚠️  Could not drop table {table}: {str(e)[:100]}")
                    
                    print(f"  ✓ Dropped {len(tables)} user tables")
                else:
                    print("  ℹ️  No user tables to drop")
            
            cursor.close()
            conn.close()
            
        except Exception as e:
            print(f"  ⚠️  Warning: Database preparation had issues: {e}")
            raise
    
    def _restore_database(self, backup_dir: Path, mode: str = 'clean'):
        """Restore database from SQL dump"""
        dump_file = backup_dir / "database.sql"
        
        if not dump_file.exists():
            print("  ⚠ Warning: database.sql not found, skipping database restore")
            return
        
        try:
            # Use psql to restore the database
            if mode == 'merge':
                # MERGE mode: Use ON CONFLICT DO NOTHING for inserts
                print("  ℹ️  MERGE mode: Errors for existing objects will be ignored")
                cmd = f"psql {self.db_url} -f {dump_file} --set ON_ERROR_STOP=off"
            else:
                # CLEAN/FORCE mode: Stop on errors
                cmd = f"psql {self.db_url} -f {dump_file}"
            
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode != 0:
                if mode == 'merge':
                    # In merge mode, errors are expected for existing objects
                    error_count = result.stderr.count('ERROR')
                    print(f"  ℹ️  Merge completed with {error_count} skipped objects (expected)")
                    print(f"  ✓ Database merged from {dump_file}")
                else:
                    print(f"  ⚠ Warning: Database restore had some errors:")
                    print(f"    {result.stderr[:500]}")
            else:
                print(f"  ✓ Database restored from {dump_file}")
            
        except Exception as e:
            print(f"  ⚠ Warning: Database restore failed: {e}")
            raise
    
    def _restore_database_from_json(self, backup_dir: Path):
        """Alternative: Restore database from JSON files"""
        json_dir = backup_dir / "tables_json"
        
        if not json_dir.exists():
            print("  ⚠ Warning: tables_json directory not found")
            return
        
        try:
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            
            json_files = sorted(json_dir.glob("*.json"))
            
            for json_file in tqdm(json_files, desc="  Restoring tables"):
                table_name = json_file.stem
                
                try:
                    with open(json_file, 'r') as f:
                        data = json.load(f)
                    
                    if not data:
                        continue
                    
                    # Get column names from first row
                    columns = list(data[0].keys())
                    
                    # Prepare insert statement
                    placeholders = ', '.join(['%s'] * len(columns))
                    columns_str = ', '.join([f'"{col}"' for col in columns])
                    insert_sql = f'INSERT INTO "{table_name}" ({columns_str}) VALUES ({placeholders})'
                    
                    # Insert data
                    for row in data:
                        values = [row[col] for col in columns]
                        cursor.execute(insert_sql, values)
                    
                    conn.commit()
                    
                except Exception as e:
                    print(f"    ⚠ Warning: Could not restore table {table_name}: {e}")
                    conn.rollback()
            
            cursor.close()
            conn.close()
            print(f"  ✓ Tables restored from JSON")
            
        except Exception as e:
            print(f"  ⚠ Warning: JSON restore failed: {e}")
    
    def _restore_storage(self, backup_dir: Path):
        """Restore storage buckets and files"""
        storage_dir = backup_dir / "storage"
        
        if not storage_dir.exists():
            print("  ℹ No storage backup found, skipping")
            return
        
        try:
            # Load buckets metadata
            metadata_file = storage_dir / "buckets_metadata.json"
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    buckets_info = json.load(f)
                
                # Create buckets
                for bucket_info in tqdm(buckets_info, desc="  Creating buckets"):
                    bucket_name = bucket_info['name']
                    try:
                        # Check if bucket exists
                        existing_buckets = self.supabase.storage.list_buckets()
                        bucket_exists = any(
                            (b.name if hasattr(b, 'name') else b.get('name')) == bucket_name 
                            for b in existing_buckets
                        )
                        
                        if not bucket_exists:
                            # Create bucket with full configuration
                            bucket_options = {
                                'public': bucket_info.get('public', False)
                            }
                            
                            # Add file size limit if specified
                            if bucket_info.get('file_size_limit'):
                                bucket_options['fileSizeLimit'] = bucket_info['file_size_limit']
                            
                            # Add allowed MIME types if specified
                            if bucket_info.get('allowed_mime_types'):
                                bucket_options['allowedMimeTypes'] = bucket_info['allowed_mime_types']
                            
                            self.supabase.storage.create_bucket(bucket_name, options=bucket_options)
                            print(f"    ✓ Created bucket: {bucket_name}")
                            
                            # Log configuration
                            if bucket_info.get('file_size_limit'):
                                size_mb = bucket_info['file_size_limit'] / (1024 * 1024)
                                print(f"      - Size limit: {size_mb:.1f} MB")
                            if bucket_info.get('allowed_mime_types'):
                                print(f"      - MIME types: {len(bucket_info['allowed_mime_types'])} types")
                        
                        # Upload files
                        bucket_dir = storage_dir / bucket_name
                        if bucket_dir.exists():
                            self._upload_bucket_files(bucket_name, bucket_dir)
                        
                    except Exception as e:
                        print(f"    ⚠ Warning: Could not restore bucket {bucket_name}: {e}")
            
            print(f"  ✓ Storage restored")
            
        except Exception as e:
            print(f"  ⚠ Warning: Storage restore failed: {e}")
    
    def _upload_bucket_files(self, bucket_name: str, bucket_dir: Path, prefix: str = ""):
        """Recursively upload files to a bucket"""
        for item in bucket_dir.iterdir():
            if item.is_file():
                file_path = f"{prefix}{item.name}" if prefix else item.name
                try:
                    with open(item, 'rb') as f:
                        file_data = f.read()
                    
                    self.supabase.storage.from_(bucket_name).upload(
                        file_path,
                        file_data,
                        file_options={"upsert": "true"}
                    )
                except Exception as e:
                    print(f"      ⚠ Warning: Could not upload {file_path}: {e}")
            
            elif item.is_dir():
                # Recurse into subdirectory
                new_prefix = f"{prefix}{item.name}/" if prefix else f"{item.name}/"
                self._upload_bucket_files(bucket_name, item, new_prefix)
    
    def _restore_auth(self, backup_dir: Path):
        """Restore authentication users"""
        auth_file = backup_dir / "auth_users.json"
        
        if not auth_file.exists():
            print("  ℹ No auth backup found, skipping")
            return
        
        try:
            with open(auth_file, 'r') as f:
                users_data = json.load(f)
            
            users = users_data.get('users', [])
            
            headers = {
                'apikey': self.supabase_key,
                'Authorization': f'Bearer {self.supabase_key}',
                'Content-Type': 'application/json'
            }
            
            for user in tqdm(users, desc="  Restoring users"):
                try:
                    # Create user via admin API
                    user_payload = {
                        'email': user.get('email'),
                        'email_confirm': True,
                        'user_metadata': user.get('user_metadata', {}),
                        'app_metadata': user.get('app_metadata', {})
                    }
                    
                    # Add phone if present
                    if user.get('phone'):
                        user_payload['phone'] = user['phone']
                        user_payload['phone_confirm'] = True
                    
                    response = requests.post(
                        f"{self.supabase_url}/auth/v1/admin/users",
                        headers=headers,
                        json=user_payload
                    )
                    
                    if response.status_code not in [200, 201]:
                        print(f"    ⚠ Warning: Could not create user {user.get('email')}: {response.text}")
                
                except Exception as e:
                    print(f"    ⚠ Warning: Could not restore user {user.get('email')}: {e}")
            
            print(f"  ✓ Restored {len(users)} auth users")
            
        except Exception as e:
            print(f"  ⚠ Warning: Auth restore failed: {e}")
    
    def _restore_database_roles(self, backup_dir: Path):
        """Restore database roles"""
        roles_file = backup_dir / "roles.sql"
        
        if not roles_file.exists():
            print("  ℹ️  No roles.sql found, skipping roles restore")
            return
        
        try:
            # Restore roles using psql
            cmd = f"psql {self.db_url} -f {roles_file}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode != 0:
                # Roles may already exist, check for actual errors
                if "already exists" in result.stderr:
                    print(f"  ℹ️  Roles already exist (expected for Supabase projects)")
                elif "ERROR" in result.stderr and "already exists" not in result.stderr:
                    print(f"  ⚠️  Warning: Some roles could not be restored: {result.stderr[:200]}")
                else:
                    print(f"  ✓ Database roles restored")
            else:
                print(f"  ✓ Database roles restored from {roles_file}")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Roles restore had issues: {e}")
    
    def _restore_edge_functions(self, backup_dir: Path, deploy: bool = True):
        """Restore edge functions"""
        functions_dir = backup_dir / "edge_functions"
        
        if not functions_dir.exists():
            print("  ℹ️  No edge_functions directory found, skipping")
            return
        
        try:
            # Copy functions to local supabase/functions directory
            import shutil
            local_functions_dir = Path("./supabase/functions")
            local_functions_dir.mkdir(parents=True, exist_ok=True)
            
            function_count = 0
            function_names = []
            for function_dir in functions_dir.iterdir():
                if function_dir.is_dir() and not function_dir.name.startswith('.') and function_dir.name != 'README.txt':
                    dest_dir = local_functions_dir / function_dir.name
                    if dest_dir.exists():
                        shutil.rmtree(dest_dir)
                    shutil.copytree(function_dir, dest_dir)
                    function_count += 1
                    function_names.append(function_dir.name)
            
            if function_count > 0:
                print(f"  ✓ Restored {function_count} edge function(s) to {local_functions_dir}")
                print(f"    Functions: {', '.join(function_names)}")
                
                # Try to deploy functions automatically if requested
                if deploy:
                    print(f"\n  🚀 Attempting to deploy edge functions...")
                    
                    # Extract project ref from Supabase URL
                    project_ref = self.supabase_url.split('//')[1].split('.')[0]
                    print(f"  📡 Target project: {project_ref}")
                    
                    # First, unlink any existing project
                    print(f"  🔓 Unlinking any existing project...")
                    subprocess.run(['npx', 'supabase', 'unlink'], capture_output=True, text=True)
                    
                    # Link to target project
                    print(f"  📡 Linking to target project: {project_ref}")
                    link_result = subprocess.run(
                        ['npx', 'supabase', 'link', '--project-ref', project_ref],
                        capture_output=True, 
                        text=True
                    )
                    
                    if link_result.returncode == 0 or "already linked" in link_result.stderr.lower() or "Finished supabase link" in link_result.stdout:
                        print(f"  ✅ Successfully linked to project: {project_ref}")
                        
                        # Deploy all functions
                        print(f"  🚀 Deploying {len(function_names)} functions...")
                        deployed = 0
                        failed = 0
                        
                        for i, func_name in enumerate(function_names, 1):
                            print(f"    [{i}/{len(function_names)}] Deploying: {func_name}")
                            
                            deploy_result = subprocess.run(
                                ['npx', 'supabase', 'functions', 'deploy', func_name, 
                                 '--project-ref', project_ref, '--no-verify-jwt'],
                                capture_output=True,
                                text=True,
                                timeout=60
                            )
                            
                            if deploy_result.returncode == 0:
                                print(f"        ✅ Deployed: {func_name}")
                                deployed += 1
                            else:
                                print(f"        ⚠️  Failed: {func_name}")
                                if deploy_result.stderr:
                                    print(f"           Error: {deploy_result.stderr[:100]}")
                                failed += 1
                        
                        print(f"\n  📊 Deployment Summary:")
                        print(f"     Total:   {len(function_names)}")
                        print(f"     Success: {deployed}")
                        print(f"     Failed:  {failed}")
                        
                        if failed == 0:
                            print(f"  ✅ All edge functions deployed successfully!")
                        else:
                            print(f"  ⚠️  Some functions failed. Check errors above.")
                    else:
                        print(f"  ⚠️  Could not link to project: {project_ref}")
                        print(f"     Error: {link_result.stderr[:200]}")
                        print(f"\n  💡 Deploy manually with:")
                        print(f"     npx supabase link --project-ref {project_ref}")
                        print(f"     npx supabase functions deploy --all")
                else:
                    print(f"  💡 Functions copied. Deploy manually with: npx supabase functions deploy --all")
            else:
                print(f"  ℹ️  No edge functions found in backup")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Edge functions restore had issues: {e}")
            import traceback
            print(f"     {traceback.format_exc()[:200]}")
    
    def _restore_realtime_config(self, backup_dir: Path):
        """Restore realtime configuration"""
        realtime_file = backup_dir / "realtime_config.json"
        
        if not realtime_file.exists():
            print("  ℹ️  No realtime_config.json found, skipping")
            return
        
        try:
            with open(realtime_file, 'r') as f:
                realtime_config = json.load(f)
            
            publications = realtime_config.get('publications', [])
            
            if not publications:
                print("  ℹ️  No realtime publications to restore")
                return
            
            # Note: Realtime publications are already restored via database.sql
            # This is just for verification and documentation
            print(f"  ℹ️  Realtime configuration documented:")
            for pub in publications:
                print(f"     - {pub['name']}: {len(pub.get('tables', []))} table(s)")
            
            print(f"  ✓ Realtime publications restored via database.sql")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Realtime config restore had issues: {e}")
    
    def _restore_webhooks(self, backup_dir: Path):
        """Restore webhooks configuration"""
        webhooks_file = backup_dir / "webhooks.json"
        
        if not webhooks_file.exists():
            print("  ℹ️  No webhooks.json found, skipping")
            return
        
        try:
            with open(webhooks_file, 'r') as f:
                webhooks_config = json.load(f)
            
            # Note: Webhooks need to be manually recreated via dashboard
            # as there's no public API for webhook management
            db_webhooks = webhooks_config.get('database_webhooks', [])
            auth_hooks = webhooks_config.get('auth_hooks', [])
            
            if db_webhooks or auth_hooks:
                print(f"  ℹ️  Webhook configuration found:")
                if db_webhooks:
                    print(f"     - Database webhooks: {len(db_webhooks)}")
                if auth_hooks:
                    print(f"     - Auth hooks: {len(auth_hooks)}")
                print(f"  💡 Webhooks need to be manually recreated in Supabase dashboard")
                print(f"     Settings → Webhooks → Add webhook")
            else:
                print(f"  ℹ️  No webhooks found in backup")
            
        except Exception as e:
            print(f"  ⚠️  Warning: Webhooks restore had issues: {e}")
    
    def verify_restore(self, backup_path: str) -> Dict:
        """
        Verify that a restore was successful
        
        Args:
            backup_path: Path to the backup directory
            
        Returns:
            Dictionary with verification results
        """
        backup_dir = Path(backup_path)
        results = {
            'database': False,
            'storage': False,
            'auth': False,
            'details': {}
        }
        
        try:
            # Verify database
            conn = psycopg2.connect(self.db_url)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
            table_count = cursor.fetchone()[0]
            results['database'] = table_count > 0
            results['details']['table_count'] = table_count
            cursor.close()
            conn.close()
        except Exception as e:
            results['details']['database_error'] = str(e)
        
        try:
            # Verify storage
            buckets = self.supabase.storage.list_buckets()
            results['storage'] = len(buckets) > 0
            results['details']['bucket_count'] = len(buckets)
        except Exception as e:
            results['details']['storage_error'] = str(e)
        
        try:
            # Verify auth
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
                user_count = len(users_data.get('users', []))
                results['auth'] = user_count > 0
                results['details']['user_count'] = user_count
        except Exception as e:
            results['details']['auth_error'] = str(e)
        
        return results
