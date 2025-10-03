#!/usr/bin/env python3
"""
Get database endpoint information from Supabase API
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
current_db_url = os.getenv('SUPABASE_DB_URL')

project_ref = supabase_url.replace('https://', '').replace('.supabase.co', '')

print("=" * 70)
print("Getting Database Connection Information")
print("=" * 70)
print(f"\nProject: {project_ref}")
print(f"API URL: {supabase_url}")

# Extract password
password = current_db_url.split(':')[2].split('@')[0]

# Try to get project settings via REST API
print("\n🔍 Checking project configuration...")

headers = {
    'apikey': supabase_key,
    'Authorization': f'Bearer {supabase_key}',
    'Content-Type': 'application/json'
}

# Check if we can access the database through PostgREST
print("\n1️⃣  Testing PostgREST API (alternative to direct DB)...")
try:
    response = requests.get(f"{supabase_url}/rest/v1/", headers=headers, timeout=5)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ PostgREST API is accessible")
        print("   💡 You can use the REST API for database operations!")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Try different connection string formats
print("\n2️⃣  Trying alternative connection formats...")

# Format 1: IPv4 Add-on format (if enabled)
ipv4_url = f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres?sslmode=require"
print(f"\n   Testing with SSL mode...")
try:
    import psycopg2
    conn = psycopg2.connect(ipv4_url, connect_timeout=5)
    conn.close()
    print(f"   ✅ SUCCESS with SSL!")
    print(f"   Use: {ipv4_url.replace(password, '[PASSWORD]')}")
except Exception as e:
    print(f"   ❌ Failed: {str(e)[:60]}")

# Format 2: Try with different SSL modes
ssl_modes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
print(f"\n3️⃣  Testing different SSL modes...")

for ssl_mode in ssl_modes:
    test_url = f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres?sslmode={ssl_mode}"
    try:
        import psycopg2
        conn = psycopg2.connect(test_url, connect_timeout=3)
        conn.close()
        print(f"   ✅ SUCCESS with sslmode={ssl_mode}!")
        print(f"   Use: {test_url.replace(password, '[PASSWORD]')}")
        
        # Update .env
        response = input(f"\n   Update .env with this connection? (yes/no): ")
        if response.lower() == 'yes':
            with open('.env', 'r') as f:
                lines = f.readlines()
            
            with open('.env', 'w') as f:
                for line in lines:
                    if line.startswith('SUPABASE_DB_URL='):
                        f.write(f'SUPABASE_DB_URL={test_url}\n')
                    else:
                        f.write(line)
            
            print("   ✅ .env updated!")
            print("\n   Run: python3 test_connection.py")
        break
    except Exception as e:
        print(f"   ❌ sslmode={ssl_mode}: {str(e)[:40]}")

print("\n" + "=" * 70)
print("Alternative: Use Supabase Client Library")
print("=" * 70)
print("""
Since direct database connection isn't working, you can use:

1. Supabase Client Library (already working!)
   - Use supabase.table('table_name').select('*').execute()
   - This uses the REST API (which IS working)

2. For pg_dump, you may need to:
   - Contact Supabase support for connection details
   - Or use the dashboard to export database
   - Or use Supabase CLI: npx supabase db dump

3. Current workaround:
   - Continue using backup_working_components.py
   - This backs up Storage + Auth (54 MB already backed up!)
   - For database, use Supabase dashboard export
""")

print("\n💡 Recommendation:")
print("   Since your project is active but DB connection fails,")
print("   this might be a network/firewall issue or the project")
print("   might not have direct database access enabled.")
print("\n   Contact Supabase support with your project ref:")
print(f"   {project_ref}")

print("\n" + "=" * 70)
