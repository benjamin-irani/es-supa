#!/usr/bin/env python3
"""
Script to help fix database connection by trying different connection methods
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv('SUPABASE_URL')
current_db_url = os.getenv('SUPABASE_DB_URL')

# Extract project reference from URL
project_ref = supabase_url.replace('https://', '').replace('.supabase.co', '')

print("=" * 60)
print("Database Connection Troubleshooter")
print("=" * 60)
print(f"\nProject Reference: {project_ref}")
print(f"Current DB URL: {current_db_url[:50]}...")

# Extract password from current connection string
try:
    password = current_db_url.split(':')[2].split('@')[0]
    print(f"Password extracted: {'*' * len(password)}")
except:
    print("\n⚠️  Could not extract password from current connection string")
    password = input("\nPlease enter your database password: ")

print("\n" + "=" * 60)
print("Testing Different Connection Methods")
print("=" * 60)

# Method 1: Direct Connection (Current - likely failing)
print("\n1️⃣  Testing Direct Connection...")
direct_url = f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres"
try:
    conn = psycopg2.connect(direct_url, connect_timeout=5)
    conn.close()
    print("   ✅ Direct connection WORKS!")
    print(f"   Use: {direct_url.replace(password, '[PASSWORD]')}")
except Exception as e:
    print(f"   ❌ Direct connection FAILED: {str(e)[:80]}")

# Method 2: Session Pooler (IPv4 + IPv6 compatible)
print("\n2️⃣  Testing Session Pooler Connection...")
# Try different regions
regions = ['us-east-1', 'us-west-1', 'ap-southeast-1', 'eu-west-1', 'eu-central-1']

for region in regions:
    pooler_session_url = f"postgresql://postgres.{project_ref}:{password}@aws-0-{region}.pooler.supabase.com:5432/postgres"
    try:
        conn = psycopg2.connect(pooler_session_url, connect_timeout=3)
        conn.close()
        print(f"   ✅ Session Pooler WORKS! (Region: {region})")
        print(f"   Use: {pooler_session_url.replace(password, '[PASSWORD]')}")
        
        # Save this to .env
        print(f"\n   💡 Update your .env file with:")
        print(f"   SUPABASE_DB_URL={pooler_session_url.replace(password, '[YOUR-PASSWORD]')}")
        
        # Ask if user wants to update
        response = input("\n   Would you like to update .env automatically? (yes/no): ")
        if response.lower() == 'yes':
            # Read current .env
            with open('.env', 'r') as f:
                lines = f.readlines()
            
            # Update DB URL line
            with open('.env', 'w') as f:
                for line in lines:
                    if line.startswith('SUPABASE_DB_URL='):
                        f.write(f'SUPABASE_DB_URL={pooler_session_url}\n')
                    else:
                        f.write(line)
            
            print("   ✅ .env file updated!")
            print("\n   Run: python3 test_connection.py")
        
        break
    except Exception as e:
        print(f"   ❌ Region {region} failed: {str(e)[:50]}")

# Method 3: Transaction Pooler (for serverless)
print("\n3️⃣  Testing Transaction Pooler Connection...")
for region in regions:
    pooler_transaction_url = f"postgresql://postgres.{project_ref}:{password}@aws-0-{region}.pooler.supabase.com:6543/postgres"
    try:
        conn = psycopg2.connect(pooler_transaction_url, connect_timeout=3)
        conn.close()
        print(f"   ✅ Transaction Pooler WORKS! (Region: {region})")
        print(f"   Use: {pooler_transaction_url.replace(password, '[PASSWORD]')}")
        break
    except Exception as e:
        print(f"   ❌ Region {region} failed: {str(e)[:50]}")

print("\n" + "=" * 60)
print("Recommendations")
print("=" * 60)
print("""
If Session Pooler worked:
  1. Use the pooler connection string shown above
  2. Update your .env file
  3. Run: python3 test_connection.py
  4. Then: python3 cli.py backup

If nothing worked:
  1. Check if project is paused in Supabase dashboard
  2. Go to: https://supabase.com/dashboard/project/{project_ref}
  3. Resume the project if paused
  4. Get the correct connection string from Settings → Database
""".format(project_ref=project_ref))

print("\n" + "=" * 60)
