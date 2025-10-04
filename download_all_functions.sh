#!/bin/bash

# Download all edge functions from Supabase

echo "📥 Downloading all 41 edge functions..."
echo ""

# Array of all function names
functions=(
    "receive-support-email"
    "send-support-email"
    "send-contact-email"
    "admin-invite-user"
    "admin-reset-user-password"
    "security-audit-log"
    "installer-setup"
    "schema-audit"
    "storage-export"
    "storage-import"
    "data-export"
    "data-import"
    "schema-extractor"
    "schema-sync"
    "schema-validator"
    "secure-password-gate"
    "security-monitor"
    "enhanced-schema-cloner"
    "deployment-writer"
    "source-data-exporter"
    "schema-synchronizer"
    "source-data-exporter-v2"
    "upgrade-manager"
    "admin-create-user"
    "contact-security-monitor"
    "comprehensive-export"
    "secure-contact-access"
    "check-subscription"
    "create-checkout"
    "customer-portal"
    "security-cors-config"
    "inspect-database"
    "export-project-snapshot"
    "import-comprehensive-snapshot"
    "generate-migration-sql"
    "remote-migrator"
    "cleanup-old-backups"
    "scheduled-backup-runner"
    "send-backup-notification"
    "trigger-webhook"
    "webhook-test"
    "document-signed-url"
)

count=0
total=${#functions[@]}

for func in "${functions[@]}"; do
    ((count++))
    echo "[$count/$total] Downloading: $func"
    npx supabase functions download "$func" --project-ref uezenrqnuuaglgwnvbsx
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Downloaded: $func"
    else
        echo "  ⚠️  Failed: $func"
    fi
    echo ""
done

echo "✅ Download complete!"
echo ""
echo "📊 Verifying..."
ls -lh supabase/functions/
echo ""
echo "Total functions: $(ls -1 supabase/functions/ | wc -l)"
