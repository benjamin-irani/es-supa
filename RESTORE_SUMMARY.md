# 🔄 Restore to New Supabase Project - Quick Guide

## 🚀 **Three Ways to Restore**

### **Method 1: Interactive Script** ⭐ **EASIEST**

```bash
python3 restore_to_new_project.py
```

**What it does:**
- Guides you through the entire process
- Lists available backups
- Prompts for new project credentials
- Tests connection before restoring
- Verifies restore after completion

**Perfect for:** First-time restore, learning the process

---

### **Method 2: Quick Restore Script** ⭐ **FASTEST**

```bash
# Create .env.new with new project credentials
cat > .env.new << EOF
SUPABASE_URL=https://your-new-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
EOF

# Run quick restore
./quick_restore.sh backups/backup_20251004_074026 .env.new
```

**What it does:**
- Restores database, storage, and auth
- Verifies restore automatically
- Shows progress and results

**Perfect for:** Quick restore, automation

---

### **Method 3: Manual CLI** ⭐ **MOST CONTROL**

```bash
# Restore everything
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new

# Or restore specific components
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new --database-only
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new --storage-only
python3 cli.py restore backups/backup_20251004_074026 --env-file .env.new --auth-only
```

**Perfect for:** Advanced users, selective restore

---

## 📋 **Prerequisites Checklist**

Before you start, make sure you have:

- [ ] ✅ A backup to restore (from `backups/` or GitHub Actions)
- [ ] ✅ New Supabase project created
- [ ] ✅ **IPv4 add-on enabled** on new project (required!)
- [ ] ✅ New project URL
- [ ] ✅ New project service_role key
- [ ] ✅ New project database URL
- [ ] ✅ PostgreSQL 15 installed locally

---

## 🎯 **Step-by-Step Process**

### **Step 1: Create New Supabase Project**

1. Go to https://supabase.com/dashboard
2. Click **"New Project"**
3. Fill in details and create
4. **Wait 2-3 minutes** for provisioning

### **Step 2: Enable IPv4 Add-on** ⚠️ **REQUIRED**

1. In new project: Settings → Add-ons
2. Enable **"IPv4 Address"**
3. Wait ~5 minutes for provisioning

**Why required:** Database restore needs direct database access

### **Step 3: Get New Project Credentials**

Click **"Connect"** in dashboard and copy:

- **Project URL:** `https://xxx.supabase.co`
- **Service Role Key:** Settings → API → service_role
- **Database URL:** Connect → Direct connection

### **Step 4: Run Restore**

Choose one of the three methods above and run it!

### **Step 5: Verify**

Check your new project dashboard:
- Database → Should see 124 tables
- Storage → Should see 18 buckets
- Authentication → Should see 9 users

---

## 📊 **What Gets Restored**

| Component | What's Included | Size |
|-----------|----------------|------|
| **Database** | All tables, data, schema | 20 MB |
| **Storage** | All buckets and files | 85 MB |
| **Auth** | All users and metadata | 9 users |
| **Total** | Complete project clone | 126 MB |

---

## ⚠️ **Important Notes**

### **Database Restore:**
- ⚠️ **Overwrites existing data** in new project
- ✅ Restores schema first, then data
- ✅ Includes all constraints and indexes
- ⏱️ Takes 5-10 minutes for large databases

### **Storage Restore:**
- ✅ Creates all buckets automatically
- ✅ Preserves directory structure
- ✅ Uploads all files
- ⏱️ Time depends on file sizes

### **Auth Restore:**
- ✅ Creates all users
- ✅ Restores metadata
- ⚠️ **Passwords are NOT restored** (users need to reset)
- ✅ Emails are auto-confirmed

---

## 🔧 **Common Issues**

### **"Database connection failed"**

**Solution:**
1. Make sure IPv4 add-on is enabled
2. Wait 5 minutes after enabling
3. Check database URL is correct
4. Use service_role key, not anon key

### **"Permission denied"**

**Solution:**
- Use service_role key (not anon key)
- Check key is from the NEW project

### **"Relation already exists"**

**Solution:**
- New project has existing tables
- Either drop them first or use a fresh project

---

## ✅ **Verification**

After restore, verify everything:

```bash
# Check database
psql $SUPABASE_DB_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Should show: 124

# Check via dashboard
# Database → Tables → Should see all tables
# Storage → Should see 18 buckets
# Authentication → Should see 9 users
```

---

## 📁 **Example: Complete Restore**

```bash
# 1. Create new project credentials file
cat > .env.new << EOF
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:newpassword@db.abcdefghijk.supabase.co:5432/postgres
EOF

# 2. Run interactive restore
python3 restore_to_new_project.py

# Or use quick restore
./quick_restore.sh backups/backup_20251004_074026 .env.new

# 3. Verify in dashboard
open https://abcdefghijk.supabase.co
```

---

## 🎉 **Success Indicators**

You'll know it worked when:

✅ Database has 124 tables  
✅ Storage has 18 buckets with files  
✅ Authentication has 9 users  
✅ No errors in restore output  
✅ Verification shows all green checkmarks  

---

## 💡 **Pro Tips**

1. **Test first:** Try restore on a test project first
2. **Backup new project:** If it has data, back it up first
3. **Check versions:** Ensure PostgreSQL versions match
4. **Monitor progress:** Watch the restore output for errors
5. **Verify thoroughly:** Check all components after restore

---

## 📞 **Need Help?**

**Documentation:**
- [RESTORE_GUIDE.md](RESTORE_GUIDE.md) - Detailed guide
- [README.md](README.md) - Project overview

**Scripts:**
- `restore_to_new_project.py` - Interactive restore
- `quick_restore.sh` - Quick restore
- `cli.py restore` - CLI restore

**Support:**
- Check restore logs for errors
- Verify credentials are correct
- Ensure IPv4 add-on is enabled

---

## 🎯 **Quick Reference**

```bash
# Interactive restore (recommended)
python3 restore_to_new_project.py

# Quick restore
./quick_restore.sh backups/backup_YYYYMMDD_HHMMSS .env.new

# CLI restore
python3 cli.py restore backups/backup_YYYYMMDD_HHMMSS --env-file .env.new

# Verify restore
python3 -c "from supabase_restore import SupabaseRestore; ..."
```

---

**Your backup is ready to restore to any new Supabase project!** 🚀
