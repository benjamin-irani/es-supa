# ⚡ Edge Functions Backup Guide

## ✅ **YES, Edge Functions Should Be Backed Up!**

Edge Functions are **critical business logic** and should absolutely be included in your backups.

---

## 🎯 **Why Backup Edge Functions?**

### **Reasons TO Backup:**
- ✅ **Complete disaster recovery** - Restore entire project including functions
- ✅ **Business logic protection** - Functions contain critical code
- ✅ **Easy restore** - Deploy functions back quickly
- ✅ **Version control** - Track function changes over time
- ✅ **Small file size** - Just code files (KB, not MB)
- ✅ **Configuration included** - Function settings preserved

### **Reasons NOT to Skip:**
- ❌ **Losing functions = losing functionality** - App breaks without them
- ❌ **Manual redeployment is tedious** - Have to redeploy each function
- ❌ **May lose configurations** - Function settings not preserved
- ❌ **Incomplete backup** - Not a true "complete" backup

---

## 📊 **What Gets Backed Up**

### **Edge Functions Include:**
- ✅ Function code (TypeScript/JavaScript)
- ✅ Function configuration
- ✅ Dependencies (import maps)
- ✅ Environment variables references
- ✅ Function metadata

### **Backup Structure:**
```
ipa_backup_20251004_080723/
├── database.sql
├── storage/
├── auth_users.json
├── edge_functions/          ← NEW!
│   ├── hello-world/
│   │   ├── index.ts
│   │   └── deno.json
│   ├── send-email/
│   │   ├── index.ts
│   │   └── deno.json
│   └── process-payment/
│       ├── index.ts
│       └── deno.json
└── metadata.json
```

---

## 🚀 **How to Backup Edge Functions**

### **Method 1: Automatic (Recommended)**

Edge functions are **automatically included** in backups!

```bash
# Regular backup (includes edge functions)
python3 cli.py backup
```

**Result:** Edge functions backed up to `edge_functions/` directory

### **Method 2: Skip Edge Functions**

If you don't want to backup edge functions:

```bash
python3 cli.py backup --no-edge-functions
```

---

## 📁 **Setup for Edge Functions Backup**

### **Requirement:**

Edge functions must be in your project directory:

```
your-project/
├── supabase/
│   └── functions/        ← Edge functions here
│       ├── hello-world/
│       ├── send-email/
│       └── process-payment/
├── backups/
├── cli.py
└── .env
```

### **If You Don't Have Local Functions:**

**Option 1: Pull from Supabase**

```bash
# Initialize Supabase CLI
npx supabase init

# Link to your project
npx supabase link --project-ref your-project-ref

# Pull functions
npx supabase functions pull
```

**Option 2: Clone from Git**

If your functions are in version control:
```bash
git clone your-functions-repo supabase/functions
```

**Option 3: Manual Download**

Download function code from Supabase Dashboard:
1. Go to Edge Functions section
2. Click on each function
3. Copy code to local files

---

## 🔄 **Restore Edge Functions**

### **Automatic Restore:**

```bash
# Restore includes edge functions
python3 cli.py restore backups/ipa_backup_20251004_080723
```

### **Manual Deploy:**

```bash
# Deploy all functions
cd supabase/functions
for func in */; do
    npx supabase functions deploy ${func%/}
done
```

### **Individual Function:**

```bash
npx supabase functions deploy hello-world
```

---

## 📊 **Backup Size Impact**

### **Typical Sizes:**

| Component | Size |
|-----------|------|
| Database | 20 MB |
| Storage | 85 MB |
| Auth | 7 KB |
| **Edge Functions** | **50-500 KB** |
| **Total** | **~105 MB** |

**Impact:** Minimal! Edge functions add <1% to backup size.

---

## ✅ **Best Practices**

### **1. Always Backup Edge Functions**
```bash
# Default behavior - includes everything
python3 cli.py backup
```

### **2. Keep Functions in Version Control**
```bash
# In addition to backups, use Git
git add supabase/functions/
git commit -m "Update edge functions"
git push
```

### **3. Document Function Dependencies**
```json
// deno.json
{
  "imports": {
    "supabase": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

### **4. Test Restore Process**
```bash
# Periodically test that functions restore correctly
python3 cli.py restore backups/test-backup
npx supabase functions deploy --verify-jwt false
```

---

## 🎯 **Use Cases**

### **Disaster Recovery**

**Scenario:** Production database corrupted

```bash
# Restore everything including functions
python3 cli.py restore backups/ipa_backup_latest

# Functions are restored to supabase/functions/
# Deploy them
npx supabase functions deploy --all
```

### **Clone to New Project**

**Scenario:** Create staging environment

```bash
# Restore to new project
python3 restore_to_new_project.py

# Deploy functions to new project
npx supabase link --project-ref new-project
npx supabase functions deploy --all
```

### **Rollback Functions**

**Scenario:** Bad function deployment

```bash
# Restore from yesterday's backup
python3 cli.py restore backups/ipa_backup_20251003

# Deploy old version
npx supabase functions deploy problematic-function
```

---

## 🔧 **Advanced Configuration**

### **Selective Function Backup**

If you only want specific functions:

```python
# Custom backup script
from supabase_backup import SupabaseBackup
import shutil
from pathlib import Path

backup = SupabaseBackup(...)
backup_path = backup.create_backup(include_edge_functions=False)

# Manually copy specific functions
functions_to_backup = ['hello-world', 'send-email']
for func in functions_to_backup:
    src = Path(f'supabase/functions/{func}')
    dst = Path(f'{backup_path}/edge_functions/{func}')
    shutil.copytree(src, dst)
```

### **Exclude Sensitive Functions**

```bash
# Backup without functions
python3 cli.py backup --no-edge-functions

# Manually backup non-sensitive functions
cp -r supabase/functions/public-api backups/manual/
```

---

## 📋 **Checklist**

### **Before Backup:**
- [ ] Edge functions exist in `supabase/functions/`
- [ ] Functions are up to date
- [ ] Function dependencies documented

### **After Backup:**
- [ ] Verify `edge_functions/` directory exists in backup
- [ ] Check function count matches expected
- [ ] Test restore on staging

### **For Restore:**
- [ ] Functions restored to `supabase/functions/`
- [ ] Deploy functions to new project
- [ ] Test functions work correctly
- [ ] Update environment variables if needed

---

## 💡 **Recommendations**

### **DO:**
- ✅ Always include edge functions in backups
- ✅ Keep functions in version control (Git)
- ✅ Document function dependencies
- ✅ Test restore process regularly
- ✅ Backup before major function changes

### **DON'T:**
- ❌ Skip edge functions backup
- ❌ Rely only on backups (use Git too)
- ❌ Forget to deploy functions after restore
- ❌ Store secrets in function code

---

## 🎊 **Summary**

**Edge Functions Backup:**
- ✅ **Included by default** in all backups
- ✅ **Minimal size impact** (<1% of total backup)
- ✅ **Critical for complete recovery**
- ✅ **Easy to restore and redeploy**

**Command:**
```bash
# Backup everything (including edge functions)
python3 cli.py backup

# Skip edge functions (not recommended)
python3 cli.py backup --no-edge-functions
```

**Your backups now include complete edge functions protection!** ⚡🚀
