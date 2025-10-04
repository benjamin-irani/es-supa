#!/usr/bin/env python3
"""
Check for webhooks in Supabase project
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def check_webhooks():
    """Check for webhooks in the database"""
    db_url = os.getenv('SUPABASE_DB_URL')
    
    if not db_url:
        print("❌ SUPABASE_DB_URL not found in .env")
        return
    
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        print("=" * 70)
        print("🔗 Checking for Webhooks")
        print("=" * 70)
        
        # Check for pg_net webhooks (if extension exists)
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM pg_extension WHERE extname = 'pg_net'
            )
        """)
        has_pg_net = cursor.fetchone()[0]
        
        if has_pg_net:
            print("\n✅ pg_net extension found")
            
            # Check for webhook requests
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'net' 
                    AND table_name = 'http_request_queue'
                )
            """)
            
            if cursor.fetchone()[0]:
                cursor.execute("SELECT COUNT(*) FROM net.http_request_queue")
                count = cursor.fetchone()[0]
                print(f"  Webhook queue entries: {count}")
        else:
            print("\nℹ️  pg_net extension not found")
        
        # Check for database triggers that might be webhooks
        print("\n📊 Checking for webhook-like triggers...")
        cursor.execute("""
            SELECT 
                event_object_table as table_name,
                trigger_name,
                action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            AND (
                action_statement LIKE '%http%'
                OR action_statement LIKE '%webhook%'
                OR action_statement LIKE '%net.%'
            )
            ORDER BY event_object_table, trigger_name
        """)
        
        triggers = cursor.fetchall()
        if triggers:
            print(f"  Found {len(triggers)} webhook-like triggers:")
            for table, trigger, action in triggers:
                print(f"    - {table}.{trigger}")
        else:
            print("  No webhook-like triggers found")
        
        # Check Supabase hooks table (if exists)
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'supabase_functions' 
                AND table_name = 'hooks'
            )
        """)
        
        if cursor.fetchone()[0]:
            cursor.execute("SELECT COUNT(*) FROM supabase_functions.hooks")
            count = cursor.fetchone()[0]
            print(f"\n✅ Supabase hooks table found: {count} hooks")
            
            if count > 0:
                cursor.execute("""
                    SELECT id, hook_table_id, hook_name, request_url 
                    FROM supabase_functions.hooks 
                    LIMIT 10
                """)
                print("\n  Hooks:")
                for row in cursor.fetchall():
                    print(f"    - {row[2]}: {row[3]}")
        else:
            print("\nℹ️  No supabase_functions.hooks table found")
        
        cursor.close()
        conn.close()
        
        print("\n" + "=" * 70)
        print("💡 To see webhooks in dashboard:")
        print("   https://supabase.com/dashboard/project/uezenrqnuuaglgwnvbsx/settings/webhooks")
        print("=" * 70)
        
    except Exception as e:
        print(f"❌ Error checking webhooks: {e}")

if __name__ == "__main__":
    check_webhooks()
