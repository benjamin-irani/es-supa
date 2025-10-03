#!/usr/bin/env python3
"""
Comprehensive database connection diagnostics
"""

import os
import socket
import requests
from dotenv import load_dotenv
import psycopg2

load_dotenv()

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
db_url = os.getenv('SUPABASE_DB_URL')

print("=" * 70)
print("🔍 Comprehensive Database Diagnostics")
print("=" * 70)

# Extract connection details
project_ref = supabase_url.replace('https://', '').replace('.supabase.co', '')
db_host = f"db.{project_ref}.supabase.co"

print(f"\nProject: {project_ref}")
print(f"Database Host: {db_host}")

# Test 1: DNS Resolution
print("\n" + "=" * 70)
print("1️⃣  DNS Resolution Test")
print("=" * 70)

try:
    ipv4_addresses = socket.getaddrinfo(db_host, 5432, socket.AF_INET)
    print(f"✅ IPv4 addresses found:")
    for addr in ipv4_addresses:
        print(f"   {addr[4][0]}")
except socket.gaierror:
    print("❌ No IPv4 addresses found")

try:
    ipv6_addresses = socket.getaddrinfo(db_host, 5432, socket.AF_INET6)
    print(f"✅ IPv6 addresses found:")
    for addr in ipv6_addresses:
        print(f"   {addr[4][0]}")
except socket.gaierror:
    print("❌ No IPv6 addresses found")

# Test 2: Check Supabase Project Status via API
print("\n" + "=" * 70)
print("2️⃣  Supabase Project Status")
print("=" * 70)

headers = {
    'apikey': supabase_key,
    'Authorization': f'Bearer {supabase_key}'
}

# Check if REST API works
try:
    response = requests.get(f"{supabase_url}/rest/v1/", headers=headers, timeout=5)
    print(f"✅ REST API Status: {response.status_code}")
    print(f"   Project is active and responding")
except Exception as e:
    print(f"❌ REST API Error: {e}")

# Check database settings endpoint
try:
    # Try to get project settings (may not work on hosted)
    response = requests.get(
        f"{supabase_url}/rest/v1/rpc/version",
        headers=headers,
        timeout=5
    )
    if response.status_code == 200:
        print(f"✅ Database version check: {response.text}")
except:
    pass

# Test 3: Try different connection strings
print("\n" + "=" * 70)
print("3️⃣  Testing Alternative Connection Methods")
print("=" * 70)

# Extract password from current DB URL
try:
    password = db_url.split(':')[2].split('@')[0]
    
    # Method 1: Direct connection (current)
    print("\nMethod 1: Direct Connection")
    print(f"  URL: postgresql://postgres:***@{db_host}:5432/postgres")
    try:
        conn = psycopg2.connect(db_url, connect_timeout=5)
        print("  ✅ SUCCESS!")
        conn.close()
    except Exception as e:
        print(f"  ❌ FAILED: {str(e)[:80]}")
    
    # Method 2: Try with sslmode=require
    print("\nMethod 2: With SSL Required")
    ssl_url = f"{db_url}?sslmode=require"
    try:
        conn = psycopg2.connect(ssl_url, connect_timeout=5)
        print("  ✅ SUCCESS!")
        conn.close()
    except Exception as e:
        print(f"  ❌ FAILED: {str(e)[:80]}")
    
    # Method 3: Try pooler connection (transaction mode)
    print("\nMethod 3: Transaction Pooler (Port 6543)")
    pooler_url = db_url.replace(':5432', ':6543').replace('postgres:', f'postgres.{project_ref}:')
    try:
        conn = psycopg2.connect(pooler_url, connect_timeout=5)
        print("  ✅ SUCCESS!")
        print(f"  Use: {pooler_url.replace(password, '[PASSWORD]')}")
        conn.close()
    except Exception as e:
        print(f"  ❌ FAILED: {str(e)[:80]}")
    
    # Method 4: Try session pooler (port 5432)
    print("\nMethod 4: Session Pooler (Port 5432)")
    session_url = db_url.replace(f'@{db_host}', f'@aws-0-us-east-1.pooler.supabase.com').replace('postgres:', f'postgres.{project_ref}:')
    try:
        conn = psycopg2.connect(session_url, connect_timeout=5)
        print("  ✅ SUCCESS!")
        print(f"  Use: {session_url.replace(password, '[PASSWORD]')}")
        conn.close()
    except Exception as e:
        print(f"  ❌ FAILED: {str(e)[:80]}")
        
except Exception as e:
    print(f"❌ Error testing connections: {e}")

# Test 4: Check if project is paused
print("\n" + "=" * 70)
print("4️⃣  Project Health Check")
print("=" * 70)

try:
    # Check storage API
    response = requests.get(
        f"{supabase_url}/storage/v1/bucket",
        headers=headers,
        timeout=5
    )
    print(f"✅ Storage API: {response.status_code} - {len(response.json())} buckets")
except Exception as e:
    print(f"❌ Storage API Error: {e}")

try:
    # Check auth API
    response = requests.get(
        f"{supabase_url}/auth/v1/admin/users",
        headers=headers,
        timeout=5
    )
    if response.status_code == 200:
        user_count = len(response.json().get('users', []))
        print(f"✅ Auth API: {response.status_code} - {user_count} users")
except Exception as e:
    print(f"❌ Auth API Error: {e}")

# Final recommendations
print("\n" + "=" * 70)
print("📋 Diagnosis Summary")
print("=" * 70)

print("""
Based on the tests above:

IF all connection methods failed:
→ Your project database is likely PAUSED or RESTRICTED
→ Action: Check Supabase dashboard for project status
→ URL: https://supabase.com/dashboard/project/uezenrqnuuaglgwnvbsx

IF Storage/Auth APIs work but database doesn't:
→ Database access may require IPv4 add-on (paid feature)
→ Or project is on a plan that restricts direct DB access
→ Action: Contact Supabase support

IF one of the pooler methods worked:
→ Update your SUPABASE_DB_URL with the working connection string
→ Re-run backups

ALTERNATIVE SOLUTIONS:
1. Export from Supabase Dashboard (Settings → Database → Backups)
2. Use Supabase Studio to export schema + data
3. Enable IPv4 add-on if on paid plan
4. Contact Supabase support with project ref: uezenrqnuuaglgwnvbsx
""")

print("=" * 70)
