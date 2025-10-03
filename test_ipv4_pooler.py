#!/usr/bin/env python3
"""
Test IPv4-compatible pooler connections
Based on the dashboard showing IPv4 incompatibility
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

password = os.getenv('SUPABASE_DB_URL').split(':')[2].split('@')[0]
project_ref = "uezenrqnuuaglgwnvbsx"

print("=" * 70)
print("Testing IPv4-Compatible Shared Pooler Connections")
print("=" * 70)
print("\n⚠️  Dashboard shows: 'Not IPv4 compatible - use Shared Pooler'")
print("🔍 Testing Shared Pooler endpoints...\n")

# Shared pooler format (IPv4 compatible)
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
    'sa-east-1',
    'ap-south-1'
]

print("Testing Shared Pooler (Session Mode - Port 5432):")
print("-" * 70)

for region in regions:
    # Shared pooler format with project ref in username
    pooler_url = f"postgresql://postgres.{project_ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres"
    
    print(f"\n🔄 Region: {region}...", end=" ")
    
    try:
        conn = psycopg2.connect(pooler_url, connect_timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        
        print(f"✅ SUCCESS!")
        print(f"\n{'=' * 70}")
        print("🎉 WORKING CONNECTION FOUND!")
        print(f"{'=' * 70}")
        print(f"\nRegion: {region}")
        print(f"Type: Shared Pooler (IPv4 compatible)")
        print(f"PostgreSQL: {version.split(',')[0]}")
        print(f"\nConnection String:")
        print(f"{pooler_url.replace(password, '[YOUR-PASSWORD]')}")
        
        # Update .env
        print(f"\n{'=' * 70}")
        response = input("Update .env file with this connection? (yes/no): ")
        if response.lower() == 'yes':
            with open('.env', 'r') as f:
                lines = f.readlines()
            
            with open('.env', 'w') as f:
                for line in lines:
                    if line.startswith('SUPABASE_DB_URL='):
                        f.write(f'SUPABASE_DB_URL={pooler_url}\n')
                    else:
                        f.write(line)
            
            print("✅ .env file updated!")
            print("\n🧪 Now run: python3 test_connection.py")
            print("📦 Then run: python3 cli.py backup")
        
        exit(0)
        
    except Exception as e:
        print(f"❌ {str(e)[:50]}")

print("\n" + "=" * 70)
print("❌ No working Shared Pooler connection found")
print("=" * 70)
print("""
This means:
1. The Shared Pooler might not be available for your project
2. You may need to enable IPv4 add-on (paid feature)
3. Or contact Supabase support

Next steps:
1. Check dashboard for "Session pooler" or "Shared pooler" tab
2. Look for IPv4-compatible connection string
3. Or contact support: https://supabase.com/support
""")
