# GitHub Actions Deployment Guide 🚀

## ✅ **Benefits of GitHub Actions**

- ✅ **Free** - 2,000 minutes/month on free tier
- ✅ **IPv6 Support** - Database connection will work!
- ✅ **Automated** - Runs daily at 2 AM UTC
- ✅ **No Server Needed** - Runs in the cloud
- ✅ **Secure** - Secrets encrypted
- ✅ **Complete Backups** - Database + Storage + Auth

---

## 📋 **Setup Instructions**

### **Step 1: Push Code to GitHub**

```bash
# Initialize git (if not already done)
cd /Users/benjaminirani/Desktop/dev/supapy
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Supabase backup system"

# Create a new repository on GitHub
# Then add remote and push
git remote add origin https://github.com/YOUR_USERNAME/supapy.git
git branch -M main
git push -u origin main
```

### **Step 2: Add Secrets to GitHub**

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**

Add these three secrets:

**Secret 1: SUPABASE_URL**
- Name: `SUPABASE_URL`
- Value: `https://uezenrqnuuaglgwnvbsx.supabase.co`

**Secret 2: SUPABASE_KEY**
- Name: `SUPABASE_KEY`
- Value: Your service role key (from .env file)

**Secret 3: SUPABASE_DB_URL**
- Name: `SUPABASE_DB_URL`
- Value: Your database connection string (from .env file)

### **Step 3: Enable GitHub Actions**

1. Go to **Actions** tab in your repository
2. You should see the "Supabase Backup" workflow
3. Click **"Enable workflow"** if prompted

### **Step 4: Test the Workflow**

**Manual Test:**
1. Go to **Actions** tab
2. Click **"Supabase Backup"** workflow
3. Click **"Run workflow"** button
4. Select branch: `main`
5. Click **"Run workflow"**

**Wait for completion** (2-5 minutes)

### **Step 5: Download Your Backup**

1. After workflow completes, click on the workflow run
2. Scroll down to **"Artifacts"** section
3. Download the backup archive
4. Extract: `tar -xzf supabase-backup-*.tar.gz`

---

## 🔄 **Automated Schedule**

The workflow runs automatically:
- **Daily at 2 AM UTC** (12 PM AEST)
- **Retention: 30 days** (backups auto-delete after 30 days)

To change the schedule, edit `.github/workflows/backup.yml`:

```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2 AM UTC
  # - cron: '0 */6 * * *'  # Every 6 hours
  # - cron: '0 0 * * 0'  # Weekly on Sunday
```

---

## 📊 **What Gets Backed Up**

When running on GitHub Actions:

| Component | Status | Why It Works |
|-----------|--------|--------------|
| **Database** | ✅ Works | GitHub runners have IPv6! |
| **Storage** | ✅ Works | API access (IPv4) |
| **Auth** | ✅ Works | API access (IPv4) |

**Complete backup every time!** 🎉

---

## 🎯 **Workflow Features**

### **1. Manual Trigger**
Run backup anytime:
- Actions → Supabase Backup → Run workflow

### **2. Connection Test**
Tests connection before backup:
- Verifies credentials
- Checks network connectivity

### **3. Backup Summary**
Shows results in workflow summary:
- Backup size
- Number of files
- Success/failure status

### **4. Artifact Upload**
Automatically uploads backup:
- Compressed (tar.gz)
- 30-day retention
- Easy download

---

## 📥 **Downloading Backups**

### **From GitHub UI:**
1. Actions → Select workflow run
2. Scroll to Artifacts
3. Click to download

### **Using GitHub CLI:**
```bash
# Install GitHub CLI
brew install gh

# Login
gh auth login

# List artifacts
gh run list --workflow=backup.yml

# Download latest
gh run download --name supabase-backup-*
```

### **Using API:**
```bash
# Get latest artifact
curl -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/YOUR_USERNAME/supapy/actions/artifacts
```

---

## 🔐 **Security Best Practices**

### **✅ DO:**
- ✅ Use GitHub Secrets for credentials
- ✅ Enable 2FA on GitHub account
- ✅ Limit repository access
- ✅ Review workflow logs regularly

### **❌ DON'T:**
- ❌ Commit .env file
- ❌ Put secrets in workflow file
- ❌ Share repository publicly with secrets
- ❌ Use anon key instead of service role

---

## 🧪 **Testing the Setup**

### **Test 1: Connection Test**

The workflow includes a connection test step. Check the logs:

```
Testing Supabase connection...
✅ PASS - Environment Variables
✅ PASS - PostgreSQL Tools
✅ PASS - Supabase API
✅ PASS - Database Connection  ← Should be green!
✅ PASS - Auth API
```

### **Test 2: Backup Verification**

After download, verify backup:

```bash
# Extract
tar -xzf supabase-backup-*.tar.gz

# Check contents
ls -lh backup_*/

# Should see:
# - database.sql (database backup)
# - storage/ (storage files)
# - auth_users.json (auth users)
```

---

## 📈 **Monitoring**

### **Email Notifications**

GitHub sends emails on:
- ✅ Workflow success
- ❌ Workflow failure

Configure in: Settings → Notifications

### **Workflow Status Badge**

Add to README.md:

```markdown
![Backup Status](https://github.com/YOUR_USERNAME/supapy/actions/workflows/backup.yml/badge.svg)
```

### **Check Workflow Runs**

```bash
# Using GitHub CLI
gh run list --workflow=backup.yml --limit 10

# Check status
gh run view WORKFLOW_RUN_ID
```

---

## 🔧 **Troubleshooting**

### **Workflow Fails**

**Check logs:**
1. Actions → Failed workflow run
2. Click on failed step
3. Read error message

**Common issues:**

**1. Secrets not set:**
```
Error: Missing required environment variables
```
**Fix:** Add secrets in repository settings

**2. Invalid credentials:**
```
Error: Invalid API key
```
**Fix:** Update SUPABASE_KEY secret

**3. Network timeout:**
```
Error: Connection timeout
```
**Fix:** Re-run workflow (temporary GitHub issue)

### **Backup Size Too Large**

GitHub Actions artifacts limited to 2GB per file.

**If backup > 2GB:**
1. Split into multiple archives
2. Or upload to external storage (S3, GCS)

---

## 💾 **Long-term Storage**

For backups older than 30 days, add upload to cloud storage:

### **Upload to AWS S3:**

Add to workflow:

```yaml
- name: Upload to S3
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    aws s3 cp ${{ steps.backup_info.outputs.backup_name }}.tar.gz \
      s3://my-backup-bucket/supabase/
```

### **Upload to Google Cloud Storage:**

```yaml
- name: Upload to GCS
  uses: google-github-actions/upload-cloud-storage@v1
  with:
    path: ${{ steps.backup_info.outputs.backup_name }}.tar.gz
    destination: my-backup-bucket/supabase/
```

---

## 📊 **Cost Analysis**

### **GitHub Actions (Free Tier):**
- ✅ 2,000 minutes/month free
- ✅ Each backup: ~5 minutes
- ✅ Daily backups: ~150 minutes/month
- ✅ **Completely free!**

### **If You Exceed Free Tier:**
- Public repos: Always free
- Private repos: $0.008/minute after free tier
- ~$0.40/month for daily backups

**Recommendation:** Use public repo or stay within free tier

---

## 🎯 **Next Steps**

### **Immediate:**
1. ✅ Push code to GitHub
2. ✅ Add secrets
3. ✅ Run manual test
4. ✅ Verify backup downloads

### **Optional Enhancements:**
- Add Slack/Discord notifications
- Upload to cloud storage
- Multiple backup schedules
- Backup rotation policy

---

## ✅ **Success Checklist**

- [ ] Code pushed to GitHub
- [ ] Repository created
- [ ] Secrets added (3 secrets)
- [ ] Workflow enabled
- [ ] Manual test run successful
- [ ] Backup downloaded and verified
- [ ] Automated schedule confirmed

---

## 🎉 **You're Done!**

Your Supabase backup system is now:
- ✅ **Automated** - Runs daily
- ✅ **Complete** - Database + Storage + Auth
- ✅ **Free** - No hosting costs
- ✅ **Reliable** - GitHub infrastructure
- ✅ **Secure** - Encrypted secrets

**The database connection issue is solved because GitHub Actions runners have IPv6 support!** 🚀

---

**Questions?** Check the workflow logs or open an issue in your repository.
