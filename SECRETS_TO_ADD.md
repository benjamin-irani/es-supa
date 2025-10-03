# 🔐 GitHub Secrets Configuration

## Repository
**https://github.com/benjamin-irani/es-supa**

---

## 📋 Add These 3 Secrets

### **How to Add Secrets:**

1. Go to: https://github.com/benjamin-irani/es-supa/settings/secrets/actions
2. Click **"New repository secret"**
3. Add each secret below

---

### **Secret 1: SUPABASE_URL**

**Name:** (copy exactly)
```
SUPABASE_URL
```

**Value:** (copy exactly)
```
https://uezenrqnuuaglgwnvbsx.supabase.co
```

Click **"Add secret"**

---

### **Secret 2: SUPABASE_KEY**

**Name:** (copy exactly)
```
SUPABASE_KEY
```

**Value:** (get from your .env file)

To get the value:
```bash
grep SUPABASE_KEY .env | cut -d'=' -f2
```

Or open `.env` file and copy the service_role key

Click **"Add secret"**

---

### **Secret 3: SUPABASE_DB_URL**

**Name:** (copy exactly)
```
SUPABASE_DB_URL
```

**Value:** (get from your .env file)

To get the value:
```bash
grep SUPABASE_DB_URL .env | cut -d'=' -f2
```

Or open `.env` file and copy the database connection string

Click **"Add secret"**

---

## ✅ Verify Secrets Added

After adding all 3 secrets, you should see:
- ✅ SUPABASE_URL
- ✅ SUPABASE_KEY
- ✅ SUPABASE_DB_URL

---

## 🚀 Run Your First Backup

1. Go to: https://github.com/benjamin-irani/es-supa/actions
2. Click **"Supabase Backup"** (left sidebar)
3. Click **"Run workflow"** button
4. Select branch: **main**
5. Click **"Run workflow"**

**Wait 2-5 minutes**

---

## 📥 Download Backup

1. Click on the completed workflow run
2. Scroll to **"Artifacts"** section
3. Download the backup archive
4. Extract and verify database.sql is included!

---

## 🎉 Success!

Once you see the database.sql file in your backup, the IPv6 issue is solved!

GitHub Actions has full IPv6 support, so your database backups will work perfectly! 🚀
