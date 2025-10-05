#!/bin/bash

# Deploy all edge functions to the correct target project

echo "🚀 Deploying All Edge Functions to Target Project"
echo "=================================================================="
echo ""

# CORRECT target project
TARGET_REF="rhldowmexwfmwyuydwjn"

echo "Target Project: $TARGET_REF"
echo ""

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
        
        npx supabase functions deploy "$func_name" --project-ref "$TARGET_REF" --no-verify-jwt 2>&1
        
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

echo "=================================================================="
echo "📊 Deployment Summary:"
echo "   Total:   $count"
echo "   Success: $success"
echo "   Failed:  $failed"
echo "=================================================================="

if [ $failed -eq 0 ]; then
    echo "✅ All functions deployed successfully to $TARGET_REF!"
else
    echo "⚠️  Some functions failed to deploy"
fi

# Verify deployment
echo ""
echo "🔍 Verifying deployment..."
npx supabase functions list --project-ref "$TARGET_REF"
