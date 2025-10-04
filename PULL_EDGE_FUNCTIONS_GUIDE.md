# 📥 Pull Edge Functions from Supabase - Complete Guide

## ✅ **Webhooks Status: None Found**

Your source project has **no webhooks** configured, so nothing to pull there!

---

## 🎯 **Edge Functions - Step by Step**

### **Step 1: Link to Source Project**

```bash
cd /Users/benjaminirani/Desktop/dev/supapy

# Link to your SOURCE Supabase project
npx supabase link --project-ref uezenrqnuuaglgwnvbsx
```

**When prompted:**
- Database password: `<your-source-database-password>`
- (This is the password from your source SUPABASE_DB_URL)

---

### **Step 2: List Edge Functions**

```bash
# Check if you have any edge functions
npx supabase functions list
```

**Expected output:**
- If you have functions: List of function names
- If no functions: Empty list or "No functions found"

---

### **Step 3: Pull Edge Functions (if any exist)**

```bash
# Pull all edge functions from source
npx supabase functions pull

# This will create: supabase/functions/your-function-name/
```

---

### **Step 4: Verify Functions Were Pulled**

```bash
# Check what was pulled
ls -lh supabase/functions/

# You should see directories for each function
```

---

### **Step 5: Create New Backup (with Edge Functions)**

```bash
# Now backup will include edge functions
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
python3 cli.py backup
```

**Result:** New backup in `backups/ipa_DDMMYYYY/ipa_backup_YYYYMMDD_HHMMSS/`

**Will include:**
- ✅ Database
- ✅ Storage
- ✅ Auth
- ✅ **Edge Functions** (if pulled)
- ✅ All other objects

---

### **Step 6: Restore with Edge Functions**

```bash
# Restore to target project
python3 restore_to_new_project.py

# Select:
# - Latest backup
# - Target credentials
# - Mode: CLEAN
# - All components: yes

# Edge functions will be automatically deployed!
```

---

## 🚀 **Quick Command Sequence**

```bash
# 1. Link to source
npx supabase link --project-ref uezenrqnuuaglgwnvbsx
# Enter password when prompted

# 2. Check for functions
npx supabase functions list

# 3. Pull functions (if any)
npx supabase functions pull

# 4. Verify
ls -lh supabase/functions/

# 5. Create new backup
python3 cli.py backup

# 6. Restore to target
python3 restore_to_new_project.py
```

---

## 📋 **Troubleshooting**

### **If Link Fails:**

```bash
# Make sure you have the correct project ref
# Check: https://supabase.com/dashboard/project/uezenrqnuuaglgwnvbsx

# Try unlinking first
npx supabase unlink

# Then link again
npx supabase link --project-ref uezenrqnuuaglgwnvbsx
```

### **If No Functions Found:**

This is normal if you don't have edge functions deployed. Your backup will work fine without them.

### **If Functions Pull Fails:**

```bash
# Check you're linked to correct project
npx supabase projects list

# Try pulling specific function
npx supabase functions pull function-name
```

---

## 🎯 **What Happens Next**

### **After Pulling Functions:**

1. **Functions saved locally** in `supabase/functions/`
2. **Next backup includes them** automatically
3. **Restore auto-deploys them** to target project

### **Restore Process with Functions:**

```
⚡ Restoring edge functions...
  ✓ Restored 3 edge function(s) to ./supabase/functions
    Functions: hello-world, send-email, process-payment

  🚀 Attempting to deploy edge functions...
  📡 Linking to project: tyqfgwgiokiautownvfn
  🚀 Deploying functions...
    ✓ Deployed: hello-world
    ✓ Deployed: send-email
    ✓ Deployed: process-payment
  ✅ Edge functions deployment completed
```

---

## ✅ **Summary**

### **Current Status:**
- ✅ Webhooks: None in source project (nothing to pull)
- ⏳ Edge Functions: Need to check and pull

### **Next Steps:**
1. Run: `npx supabase link --project-ref uezenrqnuuaglgwnvbsx`
2. Run: `npx supabase functions list`
3. If functions exist: `npx supabase functions pull`
4. Create new backup: `python3 cli.py backup`
5. Restore: `python3 restore_to_new_project.py`

---

## 💡 **Alternative: Check Dashboard**

You can also check for edge functions in the dashboard:
- Go to: https://supabase.com/dashboard/project/uezenrqnuuaglgwnvbsx/functions
- See if any functions are listed
- If yes, pull them using the commands above

---

**Ready to pull edge functions? Run the commands above!** 🚀
