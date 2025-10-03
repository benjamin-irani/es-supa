#!/bin/bash
# Script to add GitHub secrets using GitHub CLI

set -e

echo "=============================================================="
echo "Adding GitHub Secrets"
echo "=============================================================="

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not installed"
    echo "Install with: brew install gh"
    exit 1
fi

# Check if logged in
if ! gh auth status &> /dev/null; then
    echo "🔐 Please login to GitHub..."
    gh auth login
fi

REPO="benjamin-irani/es-supa"

echo ""
echo "📋 Adding secrets to repository: $REPO"
echo ""

# Read values from .env file
SUPABASE_URL=$(grep SUPABASE_URL .env | cut -d'=' -f2)
SUPABASE_KEY=$(grep SUPABASE_KEY .env | cut -d'=' -f2)
SUPABASE_DB_URL=$(grep SUPABASE_DB_URL .env | cut -d'=' -f2)

# Add secrets
echo "1️⃣  Adding SUPABASE_URL..."
echo "$SUPABASE_URL" | gh secret set SUPABASE_URL -R "$REPO"
echo "   ✅ SUPABASE_URL added"

echo ""
echo "2️⃣  Adding SUPABASE_KEY..."
echo "$SUPABASE_KEY" | gh secret set SUPABASE_KEY -R "$REPO"
echo "   ✅ SUPABASE_KEY added"

echo ""
echo "3️⃣  Adding SUPABASE_DB_URL..."
echo "$SUPABASE_DB_URL" | gh secret set SUPABASE_DB_URL -R "$REPO"
echo "   ✅ SUPABASE_DB_URL added"

echo ""
echo "=============================================================="
echo "✅ All secrets added successfully!"
echo "=============================================================="
echo ""
echo "📋 Verify secrets:"
gh secret list -R "$REPO"

echo ""
echo "🚀 Next step: Run the workflow"
echo ""
echo "Option 1 - Via CLI:"
echo "  gh workflow run backup.yml -R $REPO"
echo ""
echo "Option 2 - Via Web:"
echo "  https://github.com/$REPO/actions"
echo ""
echo "=============================================================="
