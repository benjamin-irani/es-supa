# Database Connection Fix Guide 🔧

## Current Issue

**Problem:** Database hostname `db.uezenrqnuuaglgwnvbsx.supabase.co` is not resolving  
**Error:** `could not translate host name to address: nodename nor servname provided, or not known`

**What's Working:**
- ✅ Supabase API (18 storage buckets)
- ✅ Auth API (9 users)
- ✅ Storage API
- ❌ Database connection

---

## Why This Happens

### Most Common Causes:

1. **Project is Paused** (Most Likely)
   - Free tier projects pause after inactivity
   - Database becomes inaccessible when paused
   - API and Auth still work for some operations

2. **Network/DNS Issue**
   - Temporary connectivity problem
   - DNS propagation delay
   - Firewall blocking database port

3. **Project Configuration**
   - Database pooler settings
   - Connection string format

---

## How to Fix

### Step 1: Check if Project is Paused

1. Go to [app.supabase.com](https://app.supabase.com)
2. Select your project: `uezenrqnuuaglgwnvbsx`
3. Look for a **"Paused"** or **"Inactive"** status
4. If paused, click **"Resume Project"** or **"Restore Project"**
5. Wait 1-2 minutes for project to fully activate

### Step 2: Verify Database Connection String

1. In Supabase dashboard, go to **Settings** → **Database**
2. Find **Connection string** section
3. Click **URI** tab
4. Copy the connection string
5. Compare with your `.env` file

**Format should be:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

Or direct connection:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### Step 3: Update .env if Needed

If the connection string format is different, update your `.env`:

```bash
# Edit .env file
nano .env

# Or
code .env
```

Replace `SUPABASE_DB_URL` with the correct connection string from dashboard.

### Step 4: Test Connection

```bash
python3 test_connection.py
```

Expected output after fix:
```
✅ PASS - Database Connection
ℹ️  PostgreSQL version: PostgreSQL 15.x
ℹ️  Found X table(s) in public schema
```

---

## Alternative: Use Pooler Connection

If direct connection fails, try the pooler:

1. In Supabase dashboard: **Settings** → **Database**
2. Under **Connection string**, select **Connection pooling**
3. Choose **Transaction** mode
4. Copy the pooler connection string
5. Update `SUPABASE_DB_URL` in `.env`

**Pooler format:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

---

## Workaround: Backup Without Database

While fixing the database connection, you can still backup:

### Option 1: Auth Only
```bash
python3 backup_auth_only.py
```

### Option 2: Storage + Auth
```bash
python3 backup_working_components.py
```

This backs up:
- ✅ All authentication users
- ✅ All storage files from 18 buckets
- ❌ Database tables (skipped)

---

## Verify the Fix

Once you've made changes:

### 1. Test Connection
```bash
python3 test_connection.py
```

### 2. Try Full Backup
```bash
python3 cli.py backup
```

### 3. Verify Backup
```bash
python3 cli.py list
```

---

## Still Not Working?

### Check Network Connectivity

```bash
# Test DNS resolution
nslookup db.uezenrqnuuaglgwnvbsx.supabase.co

# Test connectivity
ping db.uezenrqnuuaglgwnvbsx.supabase.co

# Test port
nc -zv db.uezenrqnuuaglgwnvbsx.supabase.co 5432
```

### Check Firewall

- Ensure port 5432 (PostgreSQL) is not blocked
- Check corporate firewall/VPN settings
- Try from different network

### Contact Supabase Support

If issue persists:
1. Go to Supabase dashboard
2. Click **Support** or **Help**
3. Provide error message and project ref
4. Mention: "Database hostname not resolving"

---

## Quick Reference

| Action | Command |
|--------|---------|
| **Test connection** | `python3 test_connection.py` |
| **Backup auth only** | `python3 backup_auth_only.py` |
| **Backup storage + auth** | `python3 backup_working_components.py` |
| **Full backup** | `python3 cli.py backup` |
| **Check DNS** | `nslookup db.uezenrqnuuaglgwnvbsx.supabase.co` |
| **Test port** | `nc -zv db.uezenrqnuuaglgwnvbsx.supabase.co 5432` |

---

## Expected Timeline

- **Project resume:** 1-2 minutes
- **DNS propagation:** 5-15 minutes (if needed)
- **Full backup after fix:** 1-10 minutes (depending on data size)

---

## Success Indicators

When fixed, you should see:

```bash
$ python3 test_connection.py

✅ PASS - Environment Variables
✅ PASS - PostgreSQL Tools
✅ PASS - Supabase API
✅ PASS - Database Connection  ← This should be green
✅ PASS - Auth API

🎉 All tests passed! You're ready to create backups.
```

Then run:
```bash
$ python3 cli.py backup

🚀 Starting Supabase backup...

📊 Backing up database...
  ✓ Database dumped to database.sql
  ✓ Tables exported to JSON

📁 Backing up storage files...
  ✓ Storage backed up

👤 Backing up auth users...
  ✓ Backed up 9 auth users

✅ Backup completed successfully!
```

---

**Most likely fix:** Resume your paused project in the Supabase dashboard! 🚀
