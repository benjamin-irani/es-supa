#!/bin/bash

# Manual Edge Functions Deployment Script
# Use this when automatic deployment fails during restore

echo "========================================================================"
echo "🚀 Manual Edge Functions Deployment"
echo "========================================================================"
echo ""

# Check if target project ref is provided
if [ -z "$1" ]; then
    echo "❌ Error: Target project ref required"
    echo ""
    echo "Usage: ./deploy_functions_manual.sh <target-project-ref>"
    echo ""
    echo "Example:"
    echo "  ./deploy_functions_manual.sh ffewlgvztyznzsadrqrz"
    echo ""
    exit 1
fi

TARGET_REF="$1"

echo "Target Project: $TARGET_REF"
echo ""

# Check if functions directory exists
if [ ! -d "supabase/functions" ]; then
    echo "❌ No functions directory found: supabase/functions"
    echo ""
    echo "Make sure you're in the correct directory and functions were copied."
    exit 1
fi

# Count functions
FUNCTION_COUNT=$(ls -1 supabase/functions | wc -l | tr -d ' ')
echo "📊 Found $FUNCTION_COUNT functions to deploy"
echo ""

# Unlink any existing project
echo "🔓 Unlinking any existing project..."
npx supabase unlink 2>/dev/null

# Link to target project
echo "📡 Linking to target project: $TARGET_REF"
echo ""
echo "⚠️  You will be prompted for the database password"
echo "   Get it from: Supabase Dashboard → Settings → Database → Connection string"
echo ""

npx supabase link --project-ref "$TARGET_REF"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Failed to link to project"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Make sure you have the correct project ref"
    echo "   2. Ensure you have database access enabled"
    echo "   3. Check your database password is correct"
    echo "   4. Verify IPv4 add-on is enabled in Supabase dashboard"
    exit 1
fi

echo ""
echo "✅ Successfully linked to project!"
echo ""

# Deploy all functions
echo "🚀 Deploying $FUNCTION_COUNT functions..."
echo ""

count=0
success=0
failed=0

for func_dir in supabase/functions/*; do
    if [ -d "$func_dir" ]; then
        func_name=$(basename "$func_dir")
        ((count++))
        
        echo "[$count/$FUNCTION_COUNT] Deploying: $func_name"
        
        npx supabase functions deploy "$func_name" --project-ref "$TARGET_REF" --no-verify-jwt
        
        if [ $? -eq 0 ]; then
            echo "  ✅ Deployed: $func_name"
            ((success++))
        else
            echo "  ❌ Failed: $func_name"
            ((failed++))
        fi
        echo ""
    fi
done

echo "========================================================================"
echo "📊 Deployment Summary:"
echo "   Total:   $count"
echo "   Success: $success"
echo "   Failed:  $failed"
echo "========================================================================"

if [ $failed -eq 0 ]; then
    echo ""
    echo "✅ All functions deployed successfully!"
    echo ""
    echo "🔍 Verify deployment:"
    echo "   npx supabase functions list --project-ref $TARGET_REF"
else
    echo ""
    echo "⚠️  Some functions failed to deploy"
    echo ""
    echo "💡 Check the errors above and try deploying failed functions individually:"
    echo "   npx supabase functions deploy <function-name> --project-ref $TARGET_REF"
fi

echo ""
