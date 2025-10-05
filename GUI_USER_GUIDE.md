# 🎨 Supabase Backup & Restore - GUI User Guide

## 🎉 **New Graphical User Interface!**

A user-friendly GUI for backing up and restoring Supabase projects - no command line needed!

---

## 🚀 **Quick Start**

### **Launch the GUI:**

```bash
./launch_gui.sh
```

Or:

```bash
python3 supabase_gui.py
```

---

## 📦 **Backup Tab**

### **Step 1: Enter Source Project Details**

Fill in the details of the Supabase project you want to backup:

1. **Supabase URL**
   - Example: `https://uezenrqnuuaglgwnvbsx.supabase.co`
   - Get from: Supabase Dashboard → Settings → API

2. **Service Role Key**
   - Starts with `eyJ...`
   - Get from: Supabase Dashboard → Settings → API → service_role (secret)
   - **Note:** This is masked by default. Check "Show credentials" to view

3. **Database URL**
   - Format: `postgresql://postgres:PASSWORD@HOST:5432/postgres`
   - Get from: Supabase Dashboard → Click "Connect" → Direct connection
   - **Note:** This is masked by default

### **Step 2: Select Backup Options**

Choose what to include in the backup:

- ✅ **Include Storage** - Backup all storage buckets and files
- ✅ **Include Auth Users** - Backup all authentication users
- ✅ **Include Edge Functions** - Backup all edge functions (auto-downloads if needed)

**Backup Directory:**
- Default: `./backups`
- Click "Browse..." to select a different location

### **Step 3: Start Backup**

1. Click **"🚀 Start Backup"**
2. Confirm the backup
3. Watch the progress in the log window
4. Wait for completion (2-5 minutes typically)

**What Gets Backed Up:**
- ✅ Complete database (all schemas, tables, data)
- ✅ All database roles and permissions
- ✅ Storage buckets and files
- ✅ Auth users and metadata
- ✅ Edge functions (42 functions)
- ✅ Realtime configuration
- ✅ Webhooks configuration
- ✅ Project settings

---

## 🔄 **Restore Tab**

### **Step 1: Select Backup**

Choose the backup you want to restore:

**Option A: Browse**
- Click "Browse..." button
- Navigate to backup directory
- Select the backup folder

**Option B: List Backups**
- Click "List Backups" button
- See all available backups with sizes
- Select from the list

### **Step 2: Enter Target Project Details**

Fill in the details of the Supabase project you want to restore TO:

1. **Supabase URL**
   - Example: `https://rhldowmexwfmwyuydwjn.supabase.co`
   - **IMPORTANT:** This is the TARGET project (where data will go)

2. **Service Role Key**
   - Target project's service role key
   - **Note:** Credentials are NOT saved (security)

3. **Database URL**
   - Target project's database URL
   - **Note:** This is masked by default

### **Step 3: Select Restore Options**

**Restore Mode:**
- **CLEAN** (Recommended) - Drop conflicting objects, then restore
- **MERGE** - Skip existing objects, add missing only
- **FORCE** (DESTRUCTIVE) - Drop entire public schema, complete rebuild

**Components to Restore:**
- ✅ **Restore Database** - Restore all tables, functions, policies
- ✅ **Restore Storage** - Restore all buckets and files
- ✅ **Restore Auth Users** - Restore all users
- ✅ **Restore Edge Functions** - Restore and auto-deploy all functions
- ✅ **Restore Database Roles** - Restore all roles and permissions

### **Step 4: Start Restore**

1. Click **"🔄 Start Restore"**
2. **VERIFY** the target project ID in the confirmation dialog
3. Confirm the restore
4. Watch the progress in the log window
5. Wait for completion (5-15 minutes typically)

**What Happens:**
1. ✅ Database prepared (CLEAN/FORCE mode)
2. ✅ Roles restored
3. ✅ Database restored (all tables, policies, functions)
4. ✅ Storage restored (buckets + files)
5. ✅ Auth users restored
6. ✅ **Edge functions deployed automatically** (all 42 functions)
7. ✅ Realtime configuration restored
8. ✅ Webhooks documented

---

## 🎨 **GUI Features**

### **Security Features:**
- ✅ **Credentials masked** by default (show='*')
- ✅ **"Show credentials" checkbox** to reveal when needed
- ✅ **No credentials saved** to disk
- ✅ **Project ID confirmation** before restore

### **User-Friendly Features:**
- ✅ **Tabbed interface** - Separate backup and restore tabs
- ✅ **Progress indicators** - Visual feedback during operations
- ✅ **Real-time logs** - See what's happening
- ✅ **Backup browser** - Easy backup selection
- ✅ **Backup list** - View all available backups
- ✅ **Error handling** - Clear error messages
- ✅ **Confirmation dialogs** - Prevent accidents

### **Technical Features:**
- ✅ **Background threading** - GUI remains responsive
- ✅ **Wraps existing code** - Uses proven backup/restore classes
- ✅ **No code breaking** - Existing CLI tools still work
- ✅ **Cross-platform** - Works on Mac, Linux, Windows

---

## 📋 **Typical Workflow**

### **Scenario 1: Backup Production**

1. Launch GUI: `./launch_gui.sh`
2. Go to **Backup** tab
3. Enter production project details
4. Check all options (Storage, Auth, Edge Functions)
5. Click "Start Backup"
6. Wait for completion
7. Note the backup path

### **Scenario 2: Restore to Staging**

1. Launch GUI: `./launch_gui.sh`
2. Go to **Restore** tab
3. Click "List Backups" and select latest
4. Enter staging project details
5. Select "CLEAN" mode
6. Check all components
7. Click "Start Restore"
8. **VERIFY** staging project ID
9. Confirm and wait

### **Scenario 3: Clone Project**

1. **Backup** source project (Backup tab)
2. **Restore** to new project (Restore tab)
3. All 42 edge functions auto-deployed
4. Perfect clone created!

---

## ⚠️ **Important Notes**

### **Before Backup:**
- ✅ Ensure you have the **service_role** key (not anon key)
- ✅ Ensure database URL is correct
- ✅ Ensure enough disk space for backup
- ✅ IPv4 add-on enabled in Supabase (for database access)

### **Before Restore:**
- ✅ **VERIFY target project ID** in confirmation dialog
- ✅ Ensure target project has IPv4 add-on enabled
- ✅ Understand restore mode implications
- ✅ Backup target project first (if it has data)
- ✅ Test on staging before production

### **During Operations:**
- ✅ Don't close the GUI window
- ✅ Watch the log for progress
- ✅ Wait for completion message
- ✅ Check for any errors in the log

---

## 🔧 **Troubleshooting**

### **GUI Won't Launch:**
```bash
# Check Python version
python3 --version  # Should be 3.7+

# Check tkinter is installed
python3 -c "import tkinter"  # Should not error

# Try launching directly
python3 supabase_gui.py
```

### **Backup Fails:**
- ✅ Check credentials are correct
- ✅ Check database URL format
- ✅ Check IPv4 add-on is enabled
- ✅ Check disk space available
- ✅ Check network connection

### **Restore Fails:**
- ✅ Check target credentials are correct
- ✅ Check backup path is valid
- ✅ Check target project is accessible
- ✅ Check edge functions deployment (may need manual deploy)

### **Edge Functions Not Deployed:**
If edge functions fail to deploy automatically:
```bash
# Manual deployment
npx supabase link --project-ref YOUR_TARGET_PROJECT_ID
npx supabase functions deploy --all
```

---

## 🎯 **Advantages of GUI**

### **vs Command Line:**
- ✅ **No typing errors** - Fill in forms instead
- ✅ **Visual feedback** - See progress bars and logs
- ✅ **Easier credential entry** - Paste directly into fields
- ✅ **Backup browser** - Visual selection of backups
- ✅ **Confirmation dialogs** - Prevent mistakes
- ✅ **No terminal knowledge needed** - User-friendly

### **vs Manual Process:**
- ✅ **Faster** - No need to remember commands
- ✅ **Safer** - Built-in confirmations
- ✅ **More reliable** - Uses proven code
- ✅ **Better UX** - Modern interface

---

## 📊 **Screenshots**

### **Backup Tab:**
```
┌─────────────────────────────────────────────────────────┐
│  📦 Backup Supabase Project                             │
├─────────────────────────────────────────────────────────┤
│  Source Project Details                                 │
│  Supabase URL:    [https://your-project.supabase.co  ] │
│  Service Role Key: [********************************] │
│  Database URL:     [********************************] │
│  ☐ Show credentials                                     │
├─────────────────────────────────────────────────────────┤
│  Backup Options                                         │
│  ☑ Include Storage                                      │
│  ☑ Include Auth Users                                   │
│  ☑ Include Edge Functions                               │
│  Backup Directory: [./backups] [Browse...]              │
├─────────────────────────────────────────────────────────┤
│            [🚀 Start Backup]                            │
│  [████████████████████████████████████] Progress        │
├─────────────────────────────────────────────────────────┤
│  Backup Log                                             │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 🚀 Starting Supabase Backup...                    │ │
│  │ ✓ Database backed up                              │ │
│  │ ✓ Storage backed up                               │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ **Summary**

The GUI provides:
- ✅ **Easy backup** of any Supabase project
- ✅ **Easy restore** to any target project
- ✅ **Visual interface** - No command line needed
- ✅ **Secure** - Credentials not saved
- ✅ **Safe** - Confirmation dialogs
- ✅ **Complete** - All components supported
- ✅ **Reliable** - Uses existing proven code

**Launch it now:**
```bash
./launch_gui.sh
```

**Enjoy the user-friendly experience!** 🎉
