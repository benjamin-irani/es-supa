#!/usr/bin/env python3
"""
Test script to verify Supabase connection and credentials
Run this before attempting backups to ensure everything is configured correctly
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client
import psycopg2
import requests

# Load environment variables
load_dotenv()


def test_env_variables():
    """Test that all required environment variables are set"""
    print("🔍 Checking environment variables...")
    
    required_vars = {
        'SUPABASE_URL': os.getenv('SUPABASE_URL'),
        'SUPABASE_KEY': os.getenv('SUPABASE_KEY'),
        'SUPABASE_DB_URL': os.getenv('SUPABASE_DB_URL')
    }
    
    missing = []
    for var, value in required_vars.items():
        if not value:
            missing.append(var)
            print(f"  ❌ {var}: Not set")
        else:
            # Mask sensitive values
            if 'KEY' in var or 'URL' in var and 'postgresql' in value:
                display_value = value[:20] + '...' if len(value) > 20 else value
            else:
                display_value = value
            print(f"  ✅ {var}: {display_value}")
    
    if missing:
        print(f"\n❌ Missing required variables: {', '.join(missing)}")
        print("Please set them in your .env file")
        return False
    
    print("  ✅ All environment variables are set\n")
    return True


def test_supabase_connection():
    """Test connection to Supabase API"""
    print("🔍 Testing Supabase API connection...")
    
    try:
        supabase = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_KEY')
        )
        
        # Try to list storage buckets as a simple test
        buckets = supabase.storage.list_buckets()
        print(f"  ✅ Connected to Supabase API")
        print(f"  ℹ️  Found {len(buckets)} storage bucket(s)\n")
        return True
        
    except Exception as e:
        print(f"  ❌ Failed to connect to Supabase API: {e}\n")
        return False


def test_database_connection():
    """Test connection to PostgreSQL database"""
    print("🔍 Testing database connection...")
    
    try:
        conn = psycopg2.connect(os.getenv('SUPABASE_DB_URL'))
        cursor = conn.cursor()
        
        # Test query
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        
        # Count tables
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        table_count = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        print(f"  ✅ Connected to PostgreSQL database")
        print(f"  ℹ️  PostgreSQL version: {version.split(',')[0]}")
        print(f"  ℹ️  Found {table_count} table(s) in public schema\n")
        return True
        
    except Exception as e:
        print(f"  ❌ Failed to connect to database: {e}\n")
        return False


def test_auth_api():
    """Test connection to Auth API"""
    print("🔍 Testing Auth API connection...")
    
    try:
        headers = {
            'apikey': os.getenv('SUPABASE_KEY'),
            'Authorization': f'Bearer {os.getenv("SUPABASE_KEY")}'
        }
        
        response = requests.get(
            f"{os.getenv('SUPABASE_URL')}/auth/v1/admin/users",
            headers=headers
        )
        
        if response.status_code == 200:
            users_data = response.json()
            user_count = len(users_data.get('users', []))
            print(f"  ✅ Connected to Auth API")
            print(f"  ℹ️  Found {user_count} user(s)\n")
            return True
        else:
            print(f"  ❌ Auth API returned status code: {response.status_code}")
            print(f"  ℹ️  Response: {response.text}\n")
            return False
            
    except Exception as e:
        print(f"  ❌ Failed to connect to Auth API: {e}\n")
        return False


def test_pg_tools():
    """Test that PostgreSQL tools are installed"""
    print("🔍 Checking PostgreSQL tools...")
    
    import subprocess
    
    tools = ['pg_dump', 'psql']
    all_found = True
    
    for tool in tools:
        try:
            result = subprocess.run(
                [tool, '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0]
                print(f"  ✅ {tool}: {version}")
            else:
                print(f"  ❌ {tool}: Not working properly")
                all_found = False
        except FileNotFoundError:
            print(f"  ❌ {tool}: Not found")
            all_found = False
        except Exception as e:
            print(f"  ❌ {tool}: Error - {e}")
            all_found = False
    
    if not all_found:
        print("\n  ℹ️  Install PostgreSQL tools:")
        print("     macOS: brew install postgresql")
        print("     Ubuntu: sudo apt-get install postgresql-client")
    
    print()
    return all_found


def main():
    """Run all tests"""
    print("=" * 60)
    print("Supabase Backup & Restore - Connection Test")
    print("=" * 60)
    print()
    
    results = {
        'Environment Variables': test_env_variables(),
        'PostgreSQL Tools': test_pg_tools(),
        'Supabase API': test_supabase_connection(),
        'Database Connection': test_database_connection(),
        'Auth API': test_auth_api()
    }
    
    print("=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print()
    
    if all(results.values()):
        print("🎉 All tests passed! You're ready to create backups.")
        return 0
    else:
        print("⚠️  Some tests failed. Please fix the issues above before proceeding.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
