# 📁 Organized Backup Folder Structure

## 🎯 **New Folder Organization**

Backups are now organized by **project name and date** for better management!

---

## 📊 **Folder Structure**

### **Format:**
```
backups/
└── {PROJECT_NAME}_{DDMMYYYY}/
    └── {PROJECT_NAME}_backup_{YYYYMMDD_HHMMSS}/
        ├── database.sql
        ├── storage/
        ├── auth_users.json
        └── ...
```

### **Example:**
```
backups/
└── ipa_04102025/                    ← Project folder (ipa, 04 Oct 2025)
    ├── ipa_backup_20251004_100955/  ← Backup at 10:09:55
    ├── ipa_backup_20251004_140000/  ← Backup at 14:00:00
    └── ipa_backup_20251004_180000/  ← Backup at 18:00:00
```

---

## 🎯 **Benefits**

### **1. Better Organization**
- ✅ All backups for a project grouped together
- ✅ All backups for a date grouped together
- ✅ Easy to find specific project/date

### **2. Multiple Projects**
```
backups/
├── ipa_04102025/          ← IPA project backups
│   ├── ipa_backup_20251004_100955/
│   └── ipa_backup_20251004_140000/
├── webapp_04102025/       ← Web app backups
│   ├── webapp_backup_20251004_110000/
│   └── webapp_backup_20251004_150000/
└── mobile_04102025/       ← Mobile app backups
    ├── mobile_backup_20251004_120000/
    └── mobile_backup_20251004_160000/
```

### **3. Easy Cleanup**
```bash
# Delete all backups for a specific date
rm -rf backups/ipa_03102025/

# Delete old backups (keep last 7 days)
find backups -type d -name "ipa_*" -mtime +7 -exec rm -rf {} \;

# Keep only today's backups
ls -d backups/ipa_* | grep -v $(date +%d%m%Y) | xargs rm -rf
```

### **4. Clear Naming**
- **Project:** Immediately see which project
- **Date:** Immediately see which day
- **Time:** Individual backup timestamp

---

## 📋 **Folder Name Format**

### **Project Date Folder:**
- **Format:** `{PROJECT_NAME}_{DDMMYYYY}`
- **Example:** `ipa_04102025`
- **Meaning:** IPA project, 4th October 2025

### **Backup Folder:**
- **Format:** `{PROJECT_NAME}_backup_{YYYYMMDD_HHMMSS}`
- **Example:** `ipa_backup_20251004_100955`
- **Meaning:** IPA backup, 2025-10-04 at 10:09:55

---

## 🎯 **Usage Examples**

### **Daily Backups:**
```
backups/
└── ipa_04102025/
    ├── ipa_backup_20251004_020000/  ← Automated (2 AM)
    ├── ipa_backup_20251004_100955/  ← Manual (10:09 AM)
    └── ipa_backup_20251004_180000/  ← Manual (6 PM)
```

### **Multiple Days:**
```
backups/
├── ipa_03102025/                    ← Yesterday
│   ├── ipa_backup_20251003_020000/
│   └── ipa_backup_20251003_140000/
├── ipa_04102025/                    ← Today
│   ├── ipa_backup_20251004_020000/
│   └── ipa_backup_20251004_100955/
└── ipa_05102025/                    ← Tomorrow
    └── ipa_backup_20251005_020000/
```

### **Multiple Projects:**
```
backups/
├── ipa_04102025/
│   └── ipa_backup_20251004_100955/
├── webapp_04102025/
│   └── webapp_backup_20251004_110000/
└── mobile_04102025/
    └── mobile_backup_20251004_120000/
```

---

## 🔍 **Finding Backups**

### **List All Backups for Project:**
```bash
ls -lh backups/ipa_*/
```

### **List Today's Backups:**
```bash
TODAY=$(date +%d%m%Y)
ls -lh backups/ipa_${TODAY}/
```

### **Find Latest Backup:**
```bash
find backups -type d -name "ipa_backup_*" | sort -r | head -1
```

### **List Backups by Date:**
```bash
# October 4th, 2025
ls -lh backups/ipa_04102025/

# October 3rd, 2025
ls -lh backups/ipa_03102025/
```

---

## 🧹 **Cleanup Strategies**

### **Delete Old Backups:**
```bash
# Delete backups older than 7 days
find backups -type d -name "ipa_*" -mtime +7 -exec rm -rf {} \;

# Delete specific date
rm -rf backups/ipa_03102025/

# Keep only last 3 dates
ls -dt backups/ipa_* | tail -n +4 | xargs rm -rf
```

### **Archive Old Backups:**
```bash
# Archive last month's backups
tar -czf archives/ipa_september_2025.tar.gz backups/ipa_*092025/
rm -rf backups/ipa_*092025/
```

---

## 📊 **Disk Space Management**

### **Check Space Usage:**
```bash
# Total space used
du -sh backups/

# Space per project
du -sh backups/ipa_*/

# Space per date
du -sh backups/ipa_04102025/

# Largest backups
du -sh backups/*/* | sort -h | tail -10
```

### **Retention Strategy:**
```bash
# Keep:
# - Last 7 days: All backups
# - Last 30 days: Daily backup only
# - Last 365 days: Weekly backup only

# Example cleanup script
find backups -type d -name "ipa_*" -mtime +7 -mtime -30 | \
  grep -v "_020000" | xargs rm -rf  # Keep only 2 AM backups
```

---

## 🔄 **Migration from Old Structure**

### **Old Structure:**
```
backups/
├── ipa_backup_20251004_080723/
├── ipa_backup_20251003_215033/
└── backup_20251004_074026/
```

### **New Structure:**
```
backups/
├── ipa_04102025/
│   └── ipa_backup_20251004_100955/
├── ipa_03102025/
│   └── ipa_backup_20251003_215033/
└── backup_20251004_074026/  ← Old backups still work
```

### **Migration Script:**
```bash
#!/bin/bash
# Migrate old backups to new structure

for backup in backups/ipa_backup_*; do
    if [ -d "$backup" ]; then
        # Extract date from backup name
        DATE=$(echo "$backup" | grep -oE '[0-9]{8}' | head -1)
        DAY=${DATE:6:2}
        MONTH=${DATE:4:2}
        YEAR=${DATE:0:4}
        
        # Create new folder structure
        NEW_FOLDER="backups/ipa_${DAY}${MONTH}${YEAR}"
        mkdir -p "$NEW_FOLDER"
        
        # Move backup
        mv "$backup" "$NEW_FOLDER/"
        echo "Migrated: $backup → $NEW_FOLDER/"
    fi
done
```

---

## 📝 **Best Practices**

### **1. Consistent Naming**
- Always use PROJECT_NAME in .env
- Backups automatically organized

### **2. Regular Cleanup**
- Delete backups older than 30 days
- Archive important backups

### **3. Monitor Disk Space**
- Check space weekly: `du -sh backups/`
- Set up alerts if space > 80%

### **4. Test Restores**
- Periodically test restore process
- Verify folder structure works

---

## 🎯 **Quick Reference**

```bash
# Create backup (auto-organized)
python3 cli.py backup
# Creates: backups/ipa_04102025/ipa_backup_20251004_HHMMSS/

# List today's backups
ls -lh backups/ipa_$(date +%d%m%Y)/

# Find latest backup
find backups -type d -name "ipa_backup_*" | sort -r | head -1

# Restore latest
python3 cli.py restore $(find backups -type d -name "ipa_backup_*" | sort -r | head -1)

# Delete old backups
find backups -type d -name "ipa_*" -mtime +30 -exec rm -rf {} \;
```

---

## ✅ **Summary**

**New Structure:**
- ✅ Organized by project and date
- ✅ Easy to find backups
- ✅ Easy to cleanup old backups
- ✅ Supports multiple projects
- ✅ Clear naming convention

**Format:** `backups/{PROJECT}_{DDMMYYYY}/{PROJECT}_backup_{YYYYMMDD_HHMMSS}/`

**Example:** `backups/ipa_04102025/ipa_backup_20251004_100955/`

**Your backups are now professionally organized!** 📁🚀
ENDOFFILE
echo "Documentation created"
