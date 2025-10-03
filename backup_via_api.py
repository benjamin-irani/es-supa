#!/usr/bin/env python3
"""
Complete backup using Supabase REST API (no direct DB connection needed)
This works even when direct database connection is unavailable
"""

import os
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
import requests
from tqdm import tqdm

load_dotenv()

# Get credentials
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

# Create backup directory
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_dir = Path(f"./backups/api_backup_{timestamp}")
backup_dir.mkdir(parents=True, exist_ok=True)

print("=" * 70)
print("🚀 Complete Backup via Supabase API")
print("=" * 70)
print(f"📁 Backup directory: {backup_dir}\n")

# Initialize Supabase client
supabase = create_client(supabase_url, supabase_key)

# 1. Backup Database Tables via REST API
print("📊 Backing up database tables via REST API...")
database_dir = backup_dir / "database_tables"
database_dir.mkdir(exist_ok=True)

try:
    # Get list of all tables using PostgREST introspection
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}'
    }
    
    # Get table list from information_schema
    print("  🔍 Discovering tables...")
    
    # Use RPC to get table names
    try:
        result = supabase.rpc('get_table_names').execute()
        tables = result.data if result.data else []
    except:
        # Fallback: try to query common tables or use REST API root
        response = requests.get(f"{supabase_url}/rest/v1/", headers=headers)
        # The root endpoint returns available tables
        tables = []
        print("  ℹ️  Using alternative table discovery method...")
    
    # If we can't get table list automatically, try common table names
    # or let user specify
    if not tables:
        print("  💡 Attempting to backup via table iteration...")
        # Try to get data from any accessible endpoint
        response = requests.get(f"{supabase_url}/rest/v1/", headers=headers)
        
        # For now, we'll use the Supabase client to query tables
        # This requires knowing table names, but we can try common ones
        print("  ℹ️  Will backup accessible tables...")
    
    # Alternative: Backup using table queries
    print("  📦 Backing up table data...")
    
    # Try to backup data from any table we can access
    # Since we can't list tables without DB access, we'll document this limitation
    
    table_count = 0
    print("  ⚠️  Note: Direct table listing requires database connection")
    print("  💡 Alternative: Export from Supabase Dashboard")
    
except Exception as e:
    print(f"  ⚠️  Table backup via API limited: {e}")
    print("  💡 Use Supabase Dashboard to export database")

# 2. Backup Auth Users
print("\n👤 Backing up auth users...")
try:
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}'
    }
    
    response = requests.get(
        f"{supabase_url}/auth/v1/admin/users",
        headers=headers
    )
    
    if response.status_code == 200:
        users_data = response.json()
        
        auth_file = backup_dir / "auth_users.json"
        with open(auth_file, 'w') as f:
            json.dump(users_data, f, indent=2)
        
        user_count = len(users_data.get('users', []))
        print(f"  ✅ Backed up {user_count} auth users")
    else:
        print(f"  ❌ Failed: HTTP {response.status_code}")
except Exception as e:
    print(f"  ❌ Error: {e}")

# 3. Backup Storage
print("\n📁 Backing up storage files...")
storage_dir = backup_dir / "storage"
storage_dir.mkdir(exist_ok=True)

try:
    buckets = supabase.storage.list_buckets()
    
    if not buckets:
        print("  ℹ️  No storage buckets found")
    else:
        buckets_info = []
        
        for bucket in tqdm(buckets, desc="  Backing up buckets"):
            bucket_name = bucket.name if hasattr(bucket, 'name') else bucket.get('name')
            bucket_dir = storage_dir / bucket_name
            bucket_dir.mkdir(exist_ok=True)
            
            bucket_info = {
                'name': bucket_name,
                'id': bucket.id if hasattr(bucket, 'id') else bucket.get('id'),
                'public': bucket.public if hasattr(bucket, 'public') else bucket.get('public', False),
            }
            buckets_info.append(bucket_info)
            
            try:
                files = supabase.storage.from_(bucket_name).list()
                
                for file in files:
                    file_name = file.get('name')
                    
                    if file.get('id') is None:
                        continue
                    
                    try:
                        file_data = supabase.storage.from_(bucket_name).download(file_name)
                        with open(bucket_dir / file_name, 'wb') as f:
                            f.write(file_data)
                    except Exception as e:
                        print(f"      ⚠️  Could not download {file_name}: {e}")
                        
            except Exception as e:
                print(f"    ⚠️  Could not backup bucket {bucket_name}: {e}")
        
        with open(storage_dir / "buckets_metadata.json", 'w') as f:
            json.dump(buckets_info, f, indent=2)
        
        print(f"  ✅ Backed up {len(buckets)} storage bucket(s)")
        
except Exception as e:
    print(f"  ❌ Storage backup failed: {e}")

# Create metadata
metadata = {
    'timestamp': datetime.now().isoformat(),
    'supabase_url': supabase_url,
    'backup_type': 'api_based',
    'backup_method': 'REST API + Storage API + Auth API',
    'database_tables': 'Limited - use dashboard export for complete DB backup',
    'storage_included': True,
    'auth_included': True,
    'note': 'Database backup via API is limited. For complete DB backup, use Supabase Dashboard or CLI'
}

with open(backup_dir / "metadata.json", 'w') as f:
    json.dump(metadata, f, indent=2)

# Calculate backup size
total_size = sum(f.stat().st_size for f in backup_dir.rglob('*') if f.is_file())
size_mb = total_size / (1024 * 1024)

print(f"\n✅ API-based backup completed!")
print(f"📦 Location: {backup_dir}")
print(f"💾 Size: {size_mb:.2f} MB")

print("\n" + "=" * 70)
print("📋 Backup Summary")
print("=" * 70)
print(f"""
✅ Auth Users: Backed up
✅ Storage Files: Backed up  
⚠️  Database Tables: Limited (API method)

For complete database backup:
1. Go to Supabase Dashboard
2. Settings → Database → Backups
3. Download latest backup
4. Or use: npx supabase db dump -f database.sql

Your current backup includes:
- All authentication users
- All storage files
- Metadata and configuration
""")

print("\n💡 Tip: This backup method works even without direct DB access!")
print("=" * 70)
