# 🎬 Restore Script Demo

## 📺 **The restore script is now running!**

It's waiting for your input in the terminal. Here's what you'll see:

---

## **Step-by-Step Guide**

### **Screen 1: Welcome & Backup Selection**

```
======================================================================
🔄 Restore Backup to New Supabase Project
======================================================================

This interactive tool will guide you through restoring a backup
to a new Supabase project. You'll need:
  • A backup to restore
  • New Supabase project credentials (URL, keys, database URL)
  • IPv4 add-on enabled on the new project


1️⃣  Select Backup to Restore

Available backups:
  1. ipa_backup_20251004_080723 (126.0 MB)
  2. backup_20251004_074026 (126.0 MB)
  3. backup_20251003_215033 (126.0 MB)
  4. backup_20251003_212325 (85.0 MB)

Select backup number (or press Enter for most recent): 
```

**What to do:** Type `1` and press Enter (or just press Enter for the most recent)

---

### **Screen 2: Enter Credentials**

```
✅ Selected: backups/ipa_backup_20251004_080723


2️⃣  Enter New Project Credentials

You need credentials from your NEW Supabase project.
Get these from: https://supabase.com/dashboard

Do you have a .env file for the new project? (yes/no): 
```

**What to do:** 

**Option A - If you have .env.new file:**
- Type `yes` and press Enter
- It will use credentials from `.env.new`

**Option B - If you don't have .env.new:**
- Type `no` and press Enter
- It will ask for credentials manually:

```
📋 Enter new project credentials:

Get these from your new Supabase project dashboard:
  1. Project URL: From dashboard URL or Settings → API
  2. Service Role Key: Settings → API → service_role (secret)
  3. Database URL: Click 'Connect' button → Direct connection

  Supabase URL (e.g., https://abcxyz.supabase.co): 
```

Enter your new project URL, then:

```
  Service Role Key (starts with eyJ...): 
```

Enter your service role key, then:

```
  Database URL (postgresql://postgres:...): 
```

Enter your database connection string, then:

```
Save these credentials to .env.new? (yes/no): 
```

Type `yes` to save for future use.

---

### **Screen 3: Connection Test**

```
3️⃣  Verifying Connection to New Project

✅ Database connection successful
   PostgreSQL: PostgreSQL 15.8 on aarch64-unknown-linux-gnu
```

**If this fails:**
- Make sure IPv4 add-on is enabled
- Check your credentials are correct
- Wait 5 minutes after enabling IPv4

---

### **Screen 4: Choose Components**

```
4️⃣  Select Components to Restore

What do you want to restore?
  Restore database? (yes/no) [yes]: 
  Restore storage files? (yes/no) [yes]: 
  Restore auth users? (yes/no) [yes]: 
```

**What to do:** Press Enter three times to restore everything

---

### **Screen 5: Confirmation**

```
5️⃣  Confirmation

⚠️  WARNING: This will overwrite existing data in the new project!

Backup: backups/ipa_backup_20251004_080723
Target: https://your-new-project.supabase.co

Will restore:
  Database: ✅ Yes
  Storage:  ✅ Yes
  Auth:     ✅ Yes

Type 'yes' to proceed: 
```

**What to do:** Type `yes` and press Enter to start the restore

---

### **Screen 6: Restore in Progress**

```
6️⃣  Restoring Backup

Restoring backup from: 2025-10-04T08:07:23.123456
Original URL: https://uezenrqnuuaglgwnvbsx.supabase.co
Target URL: https://your-new-project.supabase.co

📊 Restoring database...
  ✓ Database restored from backups/ipa_backup_20251004_080723/database.sql

📁 Restoring storage files...
  Creating buckets: 100%|████████████████| 18/18 [00:05<00:00]
  ✓ Storage restored

👤 Restoring auth users...
  Restoring users: 100%|█████████████████| 9/9 [00:03<00:00]
  ✓ Restored 9 auth users

✅ Restore completed successfully!
```

---

### **Screen 7: Verification & Success**

```
7️⃣  Verifying Restore

Verification Results:
  Database: ✅ Success
    Tables: 124
  Storage:  ✅ Success
    Buckets: 18
  Auth:     ✅ Success
    Users: 9

======================================================================
✅ Restore Completed Successfully!
======================================================================

🎉 Your new Supabase project is ready!

📊 Project URL: https://your-new-project.supabase.co

💡 Next steps:
   1. Visit your project dashboard
   2. Verify data in Database, Storage, and Authentication tabs
   3. Test your application with the new project

📝 New credentials saved in: .env.new

======================================================================
```

---

## 🎯 **Quick Actions**

### **If you want to cancel:**
Press `Ctrl+C` at any time

### **If you need to prepare:**

1. **Create new Supabase project first:**
   - Go to https://supabase.com/dashboard
   - Click "New Project"
   - Wait for provisioning

2. **Enable IPv4 add-on:**
   - Settings → Add-ons
   - Enable "IPv4 Address"
   - Wait 5 minutes

3. **Get credentials ready:**
   - Project URL
   - Service Role Key
   - Database URL

---

## 📝 **Create .env.new File (Optional)**

If you want to prepare credentials ahead of time:

```bash
cat > .env.new << EOF
SUPABASE_URL=https://your-new-project.supabase.co
SUPABASE_KEY=your-service-role-key-here
SUPABASE_DB_URL=postgresql://postgres:password@db.your-new-project.supabase.co:5432/postgres
EOF
```

Then when the script asks "Do you have a .env file?", answer `yes`.

---

## ✅ **The Script is Waiting for You!**

**Go to your terminal and follow the prompts!**

The script will guide you through each step with clear instructions.

**Total time:** 5-10 minutes for complete restore

**Good luck!** 🚀
