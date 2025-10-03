#!/usr/bin/env python3
"""
Find the correct database connection string by testing all regions
"""

import os
import psycopg2
from dotenv import load_dotenv
import requests

load_dotenv()

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
current_db_url = os.getenv('SUPABASE_DB_URL')

# Extract password
try:
    password = current_db_url.split(':')[2].split('@')[0]
except:
    password = input("Enter your database password: ")

project_ref = "uezenrqnuuaglgwnvbsx"

print("=" * 70)
print("Finding Correct Database Connection String")
print("=" * 70)
print(f"\nProject: {project_ref}")
print(f"Status: Project is ACTIVE (confirmed from dashboard)")

# Get project details from API to find region
print("\n🔍 Detecting project region from API...")
try:
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}'
    }
    
    # The REST API URL can tell us the region
    response = requests.get(f"{supabase_url}/rest/v1/", headers=headers, timeout=5)
    print(f"   API Response: {response.status_code}")
    
    # Check response headers for region hints
    if 'x-supabase-region' in response.headers:
        detected_region = response.headers['x-supabase-region']
        print(f"   ✅ Detected region: {detected_region}")
except Exception as e:
    print(f"   ⚠️  Could not auto-detect region: {e}")

print("\n" + "=" * 70)
print("Testing Connection Strings")
print("=" * 70)

# All possible regions for Supabase
regions = [
    'us-east-1',
    'us-west-1', 
    'us-west-2',
    'ap-northeast-1',
    'ap-southeast-1',
    'ap-southeast-2',
    'eu-west-1',
    'eu-west-2',
    'eu-central-1',
    'sa-east-1'
]

working_connections = []

for region in regions:
    # Try Session Pooler (port 5432)
    pooler_url = f"postgresql://postgres.{project_ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres"
    
    print(f"\n🔄 Testing {region}...", end=" ")
    
    try:
        conn = psycopg2.connect(pooler_url, connect_timeout=3)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        
        print(f"✅ SUCCESS!")
        print(f"   PostgreSQL: {version.split(',')[0]}")
        print(f"   Connection: {pooler_url.replace(password, '[PASSWORD]')}")
        
        working_connections.append({
            'region': region,
            'url': pooler_url,
            'type': 'Session Pooler'
        })
        
        # Found one, we can stop
        break
        
    except Exception as e:
        print(f"❌ Failed")

if working_connections:
    print("\n" + "=" * 70)
    print("✅ SOLUTION FOUND!")
    print("=" * 70)
    
    conn_info = working_connections[0]
    print(f"\n✨ Working connection string:")
    print(f"   Region: {conn_info['region']}")
    print(f"   Type: {conn_info['type']}")
    print(f"\n   {conn_info['url'].replace(password, '[YOUR-PASSWORD]')}")
    
    print("\n📝 Update your .env file:")
    print(f"   SUPABASE_DB_URL={conn_info['url'].replace(password, '[YOUR-PASSWORD]')}")
    
    # Offer to update automatically
    response = input("\n❓ Update .env file automatically? (yes/no): ")
    if response.lower() == 'yes':
        with open('.env', 'r') as f:
            lines = f.readlines()
        
        with open('.env', 'w') as f:
            for line in lines:
                if line.startswith('SUPABASE_DB_URL='):
                    f.write(f'SUPABASE_DB_URL={conn_info["url"]}\n')
                else:
                    f.write(line)
        
        print("   ✅ .env file updated!")
        print("\n🧪 Now run: python3 test_connection.py")
    else:
        print("\n   Copy the connection string above and update .env manually")
    
else:
    print("\n" + "=" * 70)
    print("❌ No Working Connection Found")
    print("=" * 70)
    print("""
This means you need to get the connection string directly from the dashboard:

1. Go to your Supabase dashboard
2. Click "Connect" button (top right)
3. Select "Session pooler" connection string
4. Copy it and update your .env file

Dashboard: https://supabase.com/dashboard/project/uezenrqnuuaglgwnvbsx
""")

print("\n" + "=" * 70)
