# 🎯 Smart Restore Modes - Complete Guide

## ✅ **Three Intelligent Restore Modes Implemented!**

Your restore system now supports **3 smart modes** to handle any scenario!

---

## 📊 **Restore Modes Overview**

| Mode | Behavior | Use Case | Safety |
|------|----------|----------|--------|
| **CLEAN** | Drop conflicts, then restore | Existing project with conflicts | ⚠️ Medium |
| **MERGE** | Skip existing, add missing | Add missing objects only | ✅ Safe |
| **FORCE** | Drop all, complete rebuild | Complete replacement | 🚨 Destructive |

---

## 🎯 **Mode 1: CLEAN (Default)** ⭐ **RECOMMENDED**

### **What It Does:**
1. Drops existing user tables in public schema
2. Keeps system tables (auth, storage, realtime)
3. Restores all objects from backup
4. Safe overwrite of user data

### **Behavior:**
```
🧹 CLEAN mode: Dropping user tables...
  ✓ Dropped 124 user tables
  
📊 Restoring database...
  ✓ Database restored (no conflicts)
```

### **Use Cases:**
- ✅ Restore to existing project
- ✅ Replace old data with backup
- ✅ Fix corrupted database
- ✅ Rollback to previous state

### **What Gets Dropped:**
- ✅ User tables in public schema
- ✅ Associated functions, triggers, policies

### **What's Preserved:**
- ✅ System tables (auth.*, storage.*, realtime.*)
- ✅ Database structure
- ✅ Extensions

### **Command:**
```bash
# Interactive
python3 restore_to_new_project.py
# Select mode: 1 (CLEAN)

# CLI
python3 cli.py restore <backup> --mode clean
python3 cli.py restore <backup> -m clean
```

---

## 🎯 **Mode 2: MERGE** ✅ **SAFEST**

### **What It Does:**
1. Skips existing objects (no drops)
2. Creates only missing objects
3. Ignores errors for existing objects
4. Preserves all existing data

### **Behavior:**
```
ℹ️  MERGE mode: Errors for existing objects will be ignored

📊 Restoring database...
  ℹ️  Merge completed with 150 skipped objects (expected)
  ✓ Database merged
```

### **Use Cases:**
- ✅ Add missing tables/objects
- ✅ Incremental restore
- ✅ Preserve existing data
- ✅ Safe updates

### **What Happens:**
- ✅ Existing tables: **SKIPPED**
- ✅ Missing tables: **CREATED**
- ✅ Existing data: **PRESERVED**
- ✅ Missing data: **NOT ADDED** (table exists)

### **Limitations:**
- ⚠️ Won't update existing tables
- ⚠️ Won't add rows to existing tables
- ⚠️ Only creates missing objects

### **Command:**
```bash
# Interactive
python3 restore_to_new_project.py
# Select mode: 2 (MERGE)

# CLI
python3 cli.py restore <backup> --mode merge
python3 cli.py restore <backup> -m merge
```

---

## 🎯 **Mode 3: FORCE** 🚨 **DESTRUCTIVE**

### **What It Does:**
1. **DROPS entire public schema**
2. Recreates public schema
3. Restores everything from backup
4. Complete replacement

### **Behavior:**
```
🚨 FORCE mode: Dropping public schema...
  ✓ Public schema dropped and recreated

📊 Restoring database...
  ✓ Database restored (complete rebuild)
```

### **Use Cases:**
- ⚠️ Complete database reset
- ⚠️ Fix severe corruption
- ⚠️ Start fresh with backup data
- ⚠️ Emergency recovery

### **What Gets Deleted:**
- 🚨 **ALL user tables**
- 🚨 **ALL user data**
- 🚨 **ALL functions, triggers, policies**
- 🚨 **EVERYTHING in public schema**

### **What's Preserved:**
- ✅ System schemas (auth, storage, realtime)
- ✅ Database extensions
- ✅ System configuration

### **Command:**
```bash
# Interactive
python3 restore_to_new_project.py
# Select mode: 3 (FORCE)

# CLI
python3 cli.py restore <backup> --mode force
python3 cli.py restore <backup> -m force
```

---

## 📋 **Mode Comparison**

### **Scenario: Restore to Project with Data**

| Component | CLEAN | MERGE | FORCE |
|-----------|-------|-------|-------|
| **User Tables** | Drop & Recreate | Skip existing | Drop all |
| **Existing Data** | Replaced | Preserved | Deleted |
| **Missing Tables** | Created | Created | Created |
| **Functions** | Replaced | Skip existing | Replaced |
| **Policies** | Replaced | Skip existing | Replaced |
| **System Tables** | Preserved | Preserved | Preserved |

---

## 🎯 **Decision Guide**

### **Choose CLEAN if:**
- ✅ You want to replace user data
- ✅ Database has conflicts
- ✅ You want backup data to win
- ✅ System tables should stay

### **Choose MERGE if:**
- ✅ You want to keep existing data
- ✅ Only add missing objects
- ✅ Maximum safety
- ✅ Incremental updates

### **Choose FORCE if:**
- ⚠️ Complete reset needed
- ⚠️ Severe corruption
- ⚠️ Start completely fresh
- ⚠️ Emergency only

---

## 🚀 **Usage Examples**

### **Example 1: Restore to Empty Project**

```bash
# Any mode works (CLEAN recommended)
python3 cli.py restore backups/ipa_04102025/ipa_backup_20251004_100955 --mode clean

# Result: Perfect clone
```

### **Example 2: Restore to Existing Project (Replace Data)**

```bash
# Use CLEAN mode
python3 cli.py restore <backup> --mode clean

# Result: User data replaced, system preserved
```

### **Example 3: Add Missing Objects Only**

```bash
# Use MERGE mode
python3 cli.py restore <backup> --mode merge

# Result: Existing preserved, missing added
```

### **Example 4: Complete Reset**

```bash
# Use FORCE mode (DANGEROUS!)
python3 cli.py restore <backup> --mode force

# Result: Everything deleted and restored
```

---

## 📊 **Interactive Restore Flow**

```
4️⃣  Select Restore Mode

Choose how to handle existing data:
  1. CLEAN - Drop conflicting objects, then restore (recommended)
  2. MERGE - Skip existing objects, add missing only
  3. FORCE - Drop entire public schema, complete rebuild (DESTRUCTIVE)

Select mode (1-3) [1]: 1
✅ Selected mode: CLEAN

...

6️⃣  Confirmation

⚠️  WARNING: This will drop conflicting objects and restore!

Backup: backups/ipa_04102025/ipa_backup_20251004_100955
Target: https://tyqfgwgiokiautownvfn.supabase.co
Mode: CLEAN

Type 'yes' to proceed: yes

7️⃣  Restoring Backup

🧹 Preparing database for CLEAN mode...
  ✓ Dropped 124 user tables

👥 Restoring database roles...
  ✓ Database roles restored

📊 Restoring database...
  ✓ Database restored from database.sql

✅ Restore completed successfully!
```

---

## ⚠️ **Safety Warnings**

### **CLEAN Mode:**
```
⚠️  WARNING: This will drop conflicting objects and restore!
```
- Drops user tables
- Preserves system tables
- Medium risk

### **MERGE Mode:**
```
⚠️  WARNING: This will add missing objects (existing data preserved)!
```
- No drops
- Preserves everything
- Low risk

### **FORCE Mode:**
```
🚨 DANGER: This will DELETE ALL existing data and restore!
```
- Drops entire public schema
- Complete replacement
- **HIGH RISK**

---

## 📋 **Best Practices**

### **1. For New/Empty Projects:**
```bash
# Use CLEAN mode (default)
python3 cli.py restore <backup>
```

### **2. For Existing Projects (Replace):**
```bash
# Use CLEAN mode
python3 cli.py restore <backup> --mode clean
```

### **3. For Existing Projects (Add Only):**
```bash
# Use MERGE mode
python3 cli.py restore <backup> --mode merge
```

### **4. For Emergency Reset:**
```bash
# Use FORCE mode (CAREFUL!)
python3 cli.py restore <backup> --mode force --yes
```

---

## 🎯 **CLI Commands Reference**

```bash
# CLEAN mode (default)
python3 cli.py restore <backup>
python3 cli.py restore <backup> --mode clean
python3 cli.py restore <backup> -m clean

# MERGE mode
python3 cli.py restore <backup> --mode merge
python3 cli.py restore <backup> -m merge

# FORCE mode
python3 cli.py restore <backup> --mode force
python3 cli.py restore <backup> -m force

# With auto-confirm
python3 cli.py restore <backup> --mode clean --yes
python3 cli.py restore <backup> -m clean -y

# Latest backup
python3 cli.py restore --latest --mode clean
```

---

## ✅ **Summary**

### **Smart Restore Modes:**

**CLEAN (Default)** ⭐
- Drop user tables, restore everything
- Safe for existing projects
- **Recommended for most cases**

**MERGE** ✅
- Skip existing, add missing
- Safest option
- **Use when preserving data**

**FORCE** 🚨
- Drop everything, complete rebuild
- Most destructive
- **Emergency use only**

---

## 🎊 **Achievement Unlocked!**

**Your restore system now intelligently handles:**
- ✅ Empty projects (perfect clone)
- ✅ Existing projects (smart overwrite)
- ✅ Partial updates (merge mode)
- ✅ Complete resets (force mode)

**You can now restore to ANY Supabase project safely!** 🚀
