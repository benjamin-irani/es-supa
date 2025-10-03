#!/usr/bin/env python3
"""
Backup working components (Storage + Auth)
Use this when database connection is unavailable
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
backup_dir = Path(f"./backups/partial_backup_{timestamp}")
backup_dir.mkdir(parents=True, exist_ok=True)

print("🚀 Starting Partial Backup (Storage + Auth)")
print(f"📁 Backup directory: {backup_dir}\n")

# Initialize Supabase client
supabase = create_client(supabase_url, supabase_key)

# Backup Auth Users
print("👤 Backing up auth users...")
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

# Backup Storage
print("\n📁 Backing up storage files...")
storage_dir = backup_dir / "storage"
storage_dir.mkdir(exist_ok=True)

try:
    # Get all buckets
    buckets = supabase.storage.list_buckets()
    
    if not buckets:
        print("  ℹ️  No storage buckets found")
    else:
        buckets_info = []
        
        for bucket in tqdm(buckets, desc="  Backing up buckets"):
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
                files = supabase.storage.from_(bucket_name).list()
                
                for file in files:
                    file_name = file.get('name')
                    
                    # Skip if it's a folder
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
        
        # Save buckets metadata
        with open(storage_dir / "buckets_metadata.json", 'w') as f:
            json.dump(buckets_info, f, indent=2)
        
        print(f"  ✅ Backed up {len(buckets)} storage bucket(s)")
        
except Exception as e:
    print(f"  ❌ Storage backup failed: {e}")

# Create metadata
metadata = {
    'timestamp': datetime.now().isoformat(),
    'supabase_url': supabase_url,
    'backup_type': 'partial (storage + auth)',
    'database_included': False,
    'storage_included': True,
    'auth_included': True,
    'note': 'Database backup skipped due to connection issue'
}

with open(backup_dir / "metadata.json", 'w') as f:
    json.dump(metadata, f, indent=2)

print(f"\n✅ Partial backup completed!")
print(f"📦 Location: {backup_dir}")
print(f"\n⚠️  Note: Database backup skipped (connection unavailable)")
print(f"💡 Tip: Check if your Supabase project is paused in the dashboard")
