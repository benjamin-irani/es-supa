# 🔄 Interactive Restore Walkthrough

## 📺 **What You'll See When Running the Restore**

This document shows exactly what happens when you run:
```bash
python3 restore_to_new_project.py
```

---

## 🎬 **Step-by-Step Walkthrough**

### **Welcome Screen**

```
======================================================================
🔄 Restore Backup to New Supabase Project
======================================================================

This interactive tool will guide you through restoring a backup
to a new Supabase project. You'll need:
  • A backup to restore
  • New Supabase project credentials (URL, keys, database URL)
  • IPv4 add-on enabled on the new project
```

---

### **Step 1: Select Backup**

```
1️⃣  Select Backup to Restore

Available backups:
  1. backup_20251004_074026 (126.0 MB)
  2. backup_20251003_215033 (126.0 MB)
  3. backup_20251003_212325 (85.0 MB)
  4. partial_backup_20251004_062446 (54.0 MB)
  5. auth_backup_20251004_061742 (0.0 MB)

Select backup number (or press Enter for most recent): 
```

**What to do:**
- Type `1` for the most recent backup
- Or press `Enter` to use the latest automatically

---

### **Step 2: Enter New Project Credentials**

```
2️⃣  Enter New Project Credentials

You need credentials from your NEW Supabase project.
Get these from: https://supabase.com/dashboard

Do you have a .env file for the new project? (yes/no): 
```

**Option A: If you answer "no"**

```
📋 Enter new project credentials:

Get these from your new Supabase project dashboard:
  1. Project URL: From dashboard URL or Settings → API
  2. Service Role Key: Settings → API → service_role (secret)
  3. Database URL: Click 'Connect' button → Direct connection

  Supabase URL (e.g., https://abcxyz.supabase.co): https://mynewproject.supabase.co
  Service Role Key (starts with eyJ...): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bmV3cHJvamVjdCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2OTc1NjgwMDAsImV4cCI6MjAxMzE0NDAwMH0.abc123xyz
  Database URL (postgresql://postgres:...): postgresql://postgres:newpassword@db.mynewproject.supabase.co:5432/postgres

Save these credentials to .env.new? (yes/no): yes
✅ Credentials saved to .env.new
```

**Option B: If you answer "yes"**

```
Enter path to .env file (default: .env.new): .env.new
✅ Credentials loaded from .env.new
```

---

### **Step 3: Verify Connection**

```
3️⃣  Verifying Connection to New Project

✅ Database connection successful
   PostgreSQL: PostgreSQL 15.8 on aarch64-unknown-linux-gnu
```

**If connection fails:**
```
❌ Database connection failed: could not translate host name...

💡 Make sure:
   1. IPv4 add-on is enabled in Supabase dashboard
   2. Database URL is correct
   3. You're using the service_role key, not anon key
```

---

### **Step 4: Choose Components**

```
4️⃣  Select Components to Restore

What do you want to restore?
  Restore database? (yes/no) [yes]: yes
  Restore storage files? (yes/no) [yes]: yes
  Restore auth users? (yes/no) [yes]: yes
```

**What to do:**
- Press `Enter` to restore everything (recommended)
- Or type `no` to skip specific components

---

### **Step 5: Confirmation**

```
5️⃣  Confirmation

⚠️  WARNING: This will overwrite existing data in the new project!

Backup: backups/backup_20251004_074026
Target: https://mynewproject.supabase.co

Will restore:
  Database: ✅ Yes
  Storage:  ✅ Yes
  Auth:     ✅ Yes

Type 'yes' to proceed: yes
```

**What to do:**
- Type `yes` to start the restore
- Type anything else to cancel

---

### **Step 6: Restore in Progress**

```
6️⃣  Restoring Backup

Restoring backup from: 2025-10-04T07:40:26.123456
Original URL: https://uezenrqnuuaglgwnvbsx.supabase.co
Target URL: https://mynewproject.supabase.co

📊 Restoring database...
  ✓ Database restored from backups/backup_20251004_074026/database.sql

📁 Restoring storage files...
  Creating buckets: 100%|████████████████████| 18/18 [00:05<00:00,  3.2it/s]
  ✓ Storage restored

👤 Restoring auth users...
  Restoring users: 100%|█████████████████████| 9/9 [00:03<00:00,  2.5it/s]
  ✓ Restored 9 auth users

✅ Restore completed successfully!
```

---

### **Step 7: Verification**

```
7️⃣  Verifying Restore

Verification Results:
  Database: ✅ Success
    Tables: 124
  Storage:  ✅ Success
    Buckets: 18
  Auth:     ✅ Success
    Users: 9
```

---

### **Success Screen**

```
======================================================================
✅ Restore Completed Successfully!
======================================================================

🎉 Your new Supabase project is ready!

📊 Project URL: https://mynewproject.supabase.co

💡 Next steps:
   1. Visit your project dashboard
   2. Verify data in Database, Storage, and Authentication tabs
   3. Test your application with the new project

📝 New credentials saved in: .env.new

======================================================================
```

---

## 🎯 **What You Need to Prepare**

### **Before Running the Script:**

1. **Create a new Supabase project:**
   - Go to https://supabase.com/dashboard
   - Click "New Project"
   - Fill in name, password, region
   - Wait for provisioning (~2 minutes)

2. **Enable IPv4 add-on:**
   - Settings → Add-ons
   - Enable "IPv4 Address"
   - Wait ~5 minutes

3. **Get credentials:**
   - **Project URL:** Copy from dashboard URL
   - **Service Role Key:** Settings → API → service_role (click to reveal)
   - **Database URL:** Click "Connect" → Direct connection → Copy

---

## 📋 **Example Credentials**

Here's what your credentials should look like:

```env
# .env.new
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5NzU2ODAwMCwiZXhwIjoyMDEzMTQ0MDAwfQ.1234567890abcdefghijklmnopqrstuvwxyz
SUPABASE_DB_URL=postgresql://postgres:your-db-password@db.abcdefghijk.supabase.co:5432/postgres
```

---

## ⚠️ **Important Notes**

### **During the Process:**

1. **Don't close the terminal** - Restore takes 5-10 minutes
2. **Watch for errors** - Red ❌ indicates problems
3. **Green ✅ is good** - Means that step succeeded
4. **Warnings are OK** - Yellow ⚠️ warnings are usually fine

### **After Restore:**

1. **Check your dashboard** - Verify data is there
2. **Test your app** - Make sure everything works
3. **User passwords** - Users need to reset passwords (not restored)
4. **Keep .env.new** - Save it for future reference

---

## 🔧 **Troubleshooting**

### **"Database connection failed"**

**Cause:** IPv4 add-on not enabled or not ready

**Solution:**
1. Go to new project dashboard
2. Settings → Add-ons
3. Enable "IPv4 Address"
4. Wait 5 minutes
5. Try again

### **"Permission denied"**

**Cause:** Using wrong key (anon instead of service_role)

**Solution:**
1. Go to Settings → API
2. Copy the **service_role** key (not anon)
3. Make sure to click "Reveal" to see the full key

### **"Backup directory not found"**

**Cause:** No backups available

**Solution:**
1. Run a backup first: `python3 cli.py backup`
2. Or download from GitHub Actions
3. Extract if it's a .tar.gz file

---

## ✅ **Success Checklist**

After restore, verify:

- [ ] Database has 124 tables
- [ ] Storage has 18 buckets
- [ ] Authentication has 9 users
- [ ] No errors in restore output
- [ ] Can access new project dashboard
- [ ] Data looks correct

---

## 🎬 **Ready to Start?**

Just run:
```bash
python3 restore_to_new_project.py
```

And follow the prompts! The script will guide you through everything. 🚀

---

**The entire process takes about 10 minutes from start to finish!**
