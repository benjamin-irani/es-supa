# 📛 Project Name Prefix Feature

## Overview

Backups can now be prefixed with a project name for better organization!

**Example:** Instead of `backup_20251004_080723`, you get `ipa_backup_20251004_080723`

---

## 🎯 **How to Use**

### **Method 1: Environment Variable** ⭐ **RECOMMENDED**

Add to your `.env` file:

```env
PROJECT_NAME=ipa
```

Then run backup as normal:
```bash
python3 cli.py backup
```

**Result:** `backups/ipa_backup_20251004_080723/`

---

### **Method 2: Command Line Option**

```bash
python3 cli.py backup --project-name ipa
```

**Result:** `backups/ipa_backup_20251004_080723/`

---

### **Method 3: Short Option**

```bash
python3 cli.py backup -p ipa
```

**Result:** `backups/ipa_backup_20251004_080723/`

---

## 📋 **Configuration**

### **Local Backups**

Edit `.env` file:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Backup Configuration
BACKUP_DIR=./backups
PROJECT_NAME=ipa  # ← Add this line
```

### **GitHub Actions**

Add `PROJECT_NAME` as a GitHub secret:

1. Go to: https://github.com/your-username/your-repo/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `PROJECT_NAME`
4. Value: `ipa`
5. Click **"Add secret"**

---

## 📊 **Backup Naming Examples**

### **Without Project Name:**
```
backups/
├── backup_20251004_080723/
├── backup_20251003_215033/
└── backup_20251003_212325/
```

### **With Project Name (ipa):**
```
backups/
├── ipa_backup_20251004_080723/
├── ipa_backup_20251003_215033/
└── ipa_backup_20251003_212325/
```

### **Multiple Projects:**
```
backups/
├── ipa_backup_20251004_080723/
├── ipa_backup_20251003_215033/
├── webapp_backup_20251004_070000/
├── webapp_backup_20251003_190000/
├── mobile_backup_20251004_060000/
└── mobile_backup_20251003_180000/
```

---

## 🎯 **Use Cases**

### **1. Multiple Projects**

If you backup multiple Supabase projects:

```bash
# Project 1: IPA
PROJECT_NAME=ipa python3 cli.py backup

# Project 2: Web App
PROJECT_NAME=webapp python3 cli.py backup

# Project 3: Mobile App
PROJECT_NAME=mobile python3 cli.py backup
```

### **2. Environment-Based Naming**

```bash
# Production
PROJECT_NAME=prod python3 cli.py backup

# Staging
PROJECT_NAME=staging python3 cli.py backup

# Development
PROJECT_NAME=dev python3 cli.py backup
```

### **3. Client-Based Naming**

```bash
# Client A
PROJECT_NAME=clienta python3 cli.py backup

# Client B
PROJECT_NAME=clientb python3 cli.py backup
```

---

## 🔧 **Advanced Usage**

### **Different .env Files**

```bash
# Production project
cat > .env.prod << EOF
SUPABASE_URL=https://prod-project.supabase.co
SUPABASE_KEY=prod-key
SUPABASE_DB_URL=postgresql://...
PROJECT_NAME=prod
EOF

# Staging project
cat > .env.staging << EOF
SUPABASE_URL=https://staging-project.supabase.co
SUPABASE_KEY=staging-key
SUPABASE_DB_URL=postgresql://...
PROJECT_NAME=staging
EOF

# Backup production
python3 cli.py backup --env-file .env.prod

# Backup staging
python3 cli.py backup --env-file .env.staging
```

### **Scripted Backups**

```bash
#!/bin/bash
# backup_all_projects.sh

PROJECTS=("ipa" "webapp" "mobile")

for project in "${PROJECTS[@]}"; do
    echo "Backing up $project..."
    PROJECT_NAME=$project python3 cli.py backup
done
```

---

## 📝 **Naming Rules**

### **Valid Project Names:**
- ✅ `ipa`
- ✅ `my-project`
- ✅ `project_123`
- ✅ `ClientA`
- ✅ `prod-v2`

### **Recommended:**
- Use lowercase letters
- Use hyphens or underscores for spaces
- Keep it short (3-15 characters)
- Make it descriptive

### **Avoid:**
- ❌ Spaces (use hyphens instead)
- ❌ Special characters (!, @, #, etc.)
- ❌ Very long names (>20 characters)

---

## 🔄 **Restore with Project Names**

Restore works the same way:

```bash
# Restore from ipa backup
python3 cli.py restore backups/ipa_backup_20251004_080723

# Or use interactive restore
python3 restore_to_new_project.py
# (Will show all backups including prefixed ones)
```

---

## 📊 **GitHub Actions Integration**

### **Add Secret:**

```bash
# Using GitHub CLI
gh secret set PROJECT_NAME -b "ipa" -R your-username/your-repo

# Or via web interface
# Settings → Secrets → Actions → New repository secret
# Name: PROJECT_NAME
# Value: ipa
```

### **Workflow Will Use It Automatically:**

The workflow is already configured to use `PROJECT_NAME` from secrets.

**Backups will be named:** `ipa_backup_YYYYMMDD_HHMMSS`

---

## ✅ **Benefits**

1. **Better Organization** - Easily identify which project a backup belongs to
2. **Multiple Projects** - Backup different projects to the same directory
3. **Clear Naming** - No confusion about which backup is which
4. **Automation Friendly** - Easy to script and automate
5. **Searchable** - Easy to find backups with `ls backups/ipa_*`

---

## 🎯 **Quick Reference**

```bash
# Set project name in .env
echo "PROJECT_NAME=ipa" >> .env

# Run backup (uses .env)
python3 cli.py backup

# Or specify on command line
python3 cli.py backup --project-name ipa
python3 cli.py backup -p ipa

# List backups for specific project
ls -lh backups/ipa_*

# Find latest backup for project
ls -td backups/ipa_* | head -1
```

---

## 📋 **Migration Guide**

### **If You Have Existing Backups:**

Your old backups (without prefix) will still work fine. New backups will have the prefix.

```
backups/
├── backup_20251003_215033/      ← Old backup (still works)
├── backup_20251003_212325/      ← Old backup (still works)
└── ipa_backup_20251004_080723/  ← New backup (with prefix)
```

### **To Rename Old Backups:**

```bash
# Optional: Rename old backups to include prefix
for dir in backups/backup_*; do
    new_name=$(echo "$dir" | sed 's/backup_/ipa_backup_/')
    mv "$dir" "$new_name"
    echo "Renamed: $dir → $new_name"
done
```

---

**Project name prefix makes your backups more organized and professional!** 🎉
