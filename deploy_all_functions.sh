#!/bin/bash

# Deploy all edge functions to target project

echo "🚀 Deploying All Edge Functions to Target Project"
echo "=" * 70
echo ""

# Target project
TARGET_REF="tyqfgwgiokiautownvfn"

# Get list of local functions
FUNCTIONS_DIR="supabase/functions"

if [ ! -d "$FUNCTIONS_DIR" ]; then
    echo "❌ No functions directory found: $FUNCTIONS_DIR"
    exit 1
fi

# Count functions
FUNCTION_COUNT=$(ls -1 "$FUNCTIONS_DIR" | wc -l | tr -d ' ')
echo "📊 Found $FUNCTION_COUNT functions to deploy"
echo ""

# Deploy each function
count=0
success=0
failed=0

for func_dir in "$FUNCTIONS_DIR"/*; do
    if [ -d "$func_dir" ]; then
        func_name=$(basename "$func_dir")
        ((count++))
        
        echo "[$count/$FUNCTION_COUNT] Deploying: $func_name"
        
        npx supabase functions deploy "$func_name" --project-ref "$TARGET_REF" --no-verify-jwt
        
        if [ $? -eq 0 ]; then
            echo "  ✅ Success: $func_name"
            ((success++))
        else
            echo "  ❌ Failed: $func_name"
            ((failed++))
        fi
        echo ""
    fi
done

echo "=" * 70
echo "📊 Deployment Summary:"
echo "   Total:   $count"
echo "   Success: $success"
echo "   Failed:  $failed"
echo "=" * 70

if [ $failed -eq 0 ]; then
    echo "✅ All functions deployed successfully!"
else
    echo "⚠️  Some functions failed to deploy"
fi
