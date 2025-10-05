#!/usr/bin/env python3
"""
Check edge functions in target Supabase project
"""

import subprocess
import sys

# Target project ref
target_ref = "tyqfgwgiokiautownvfn"

print("=" * 70)
print("🔍 Checking Edge Functions in Target Project")
print("=" * 70)
print(f"\nTarget Project: {target_ref}")
print()

# Try to list functions in target project
try:
    result = subprocess.run(
        ['npx', 'supabase', 'functions', 'list', '--project-ref', target_ref],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode == 0:
        print("✅ Successfully connected to target project\n")
        print(result.stdout)
        
        # Count functions
        lines = result.stdout.split('\n')
        function_count = sum(1 for line in lines if '|' in line and 'NAME' not in line and line.strip())
        
        print(f"\n📊 Total functions in target: {function_count}")
        
        if function_count == 0:
            print("\n❌ No edge functions found in target project!")
            print("\n💡 Functions may not have been deployed during restore.")
            print("   You can deploy them manually with:")
            print(f"   npx supabase link --project-ref {target_ref}")
            print(f"   npx supabase functions deploy --all")
        else:
            print(f"\n✅ Target project has {function_count} edge functions deployed")
            
    else:
        print(f"❌ Error listing functions: {result.stderr}")
        print("\n💡 Make sure you're linked to the target project:")
        print(f"   npx supabase link --project-ref {target_ref}")
        
except subprocess.TimeoutExpired:
    print("❌ Command timed out")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 70)
