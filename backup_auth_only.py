#!/usr/bin/env python3
"""
Quick script to backup just Auth users (working component)
"""

import os
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import requests

load_dotenv()

# Get credentials
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

# Create backup directory
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_dir = Path(f"./backups/auth_backup_{timestamp}")
backup_dir.mkdir(parents=True, exist_ok=True)

print(f"🚀 Backing up Auth users...")
print(f"📁 Backup directory: {backup_dir}\n")

# Backup auth users
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
        print(f"✅ Successfully backed up {user_count} auth users")
        print(f"📄 Saved to: {auth_file}")
        
        # Create metadata
        metadata = {
            'timestamp': datetime.now().isoformat(),
            'supabase_url': supabase_url,
            'user_count': user_count,
            'backup_type': 'auth_only'
        }
        
        with open(backup_dir / "metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"\n🎉 Backup completed successfully!")
        print(f"📦 Location: {backup_dir}")
        
    else:
        print(f"❌ Failed: HTTP {response.status_code}")
        print(f"Response: {response.text}")
        
except Exception as e:
    print(f"❌ Error: {e}")
