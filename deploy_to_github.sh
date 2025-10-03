#!/bin/bash
# Quick deployment script for GitHub Actions

set -e

echo "=============================================================="
echo "Deploy Supabase Backup to GitHub Actions"
echo "=============================================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo ""
    echo "📝 Initializing git repository..."
    git init
    echo "✅ Git initialized"
fi

# Check if remote exists
if ! git remote get-url origin &> /dev/null; then
    echo ""
    echo "❓ Enter your GitHub repository URL:"
    echo "   Example: https://github.com/username/supapy.git"
    read -p "   URL: " REPO_URL
    
    git remote add origin "$REPO_URL"
    echo "✅ Remote added"
fi

# Add all files
echo ""
echo "📦 Adding files to git..."
git add .

# Show what will be committed
echo ""
echo "Files to be committed:"
git status --short

# Commit
echo ""
read -p "Enter commit message (or press Enter for default): " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Deploy Supabase backup system with GitHub Actions"
fi

git commit -m "$COMMIT_MSG" || echo "Nothing to commit or already committed"

# Push
echo ""
echo "🚀 Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "=============================================================="
echo "✅ Code pushed to GitHub!"
echo "=============================================================="
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Go to your GitHub repository:"
echo "   $(git remote get-url origin | sed 's/\.git$//')"
echo ""
echo "2. Add secrets (Settings → Secrets → Actions):"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_KEY"
echo "   - SUPABASE_DB_URL"
echo ""
echo "3. Go to Actions tab and run 'Supabase Backup' workflow"
echo ""
echo "4. Download backup from Artifacts"
echo ""
echo "📖 Full guide: GITHUB_ACTIONS_SETUP.md"
echo "=============================================================="
