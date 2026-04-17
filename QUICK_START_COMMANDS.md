# Quick Start Commands for PhilFIDA TaskFlow Rebuild

## Immediate Actions Required

### 1. Create New Supabase Project
```bash
# Go to https://supabase.com/dashboard
# Create new project → get URL and keys
```

### 2. Update Environment Variables
```bash
# Navigate to project
cd /Users/charles/Projects/philfida-taskmanage/taskflow-app

# Update .env.local with new Supabase credentials
# VITE_SUPABASE_URL=https://your-new-project.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=your-new-publishable-key
```

### 3. Test Local Connection
```bash
npm install
npm run dev
# Test app works with new Supabase
```

### 4. Setup Database Schema
# Copy SQL from REBUILD_PLAN.md
# Run in Supabase SQL Editor

### 5. Deploy to Production
```bash
# Push to new GitHub repo
git add .
git commit -m "Rebuild: Updated Supabase configuration"
git push origin main

# Deploy via Vercel (connected to new GitHub repo)
```

## Critical Files to Update

1. **`.env.local`** - New Supabase URL and keys
2. **Vercel Environment Variables** - Production Supabase credentials
3. **Google OAuth** - Update redirect URLs to new domain

## One-Command Setup Script (Optional)

```bash
# Run this after creating new Supabase project
#!/bin/bash

echo "Setting up PhilFIDA TaskFlow..."

# Get new Supabase credentials
read -p "Enter new Supabase URL: " SUPABASE_URL
read -p "Enter new Supabase Anon Key: " SUPABASE_KEY

# Update .env.local
cat > taskflow-app/.env.local << EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_KEY
EOF

echo "Environment variables updated!"
echo "Next: Run the SQL schema in Supabase Dashboard"
echo "Then: npm run dev to test locally"
```

## Verification Checklist

- [ ] New Supabase project created
- [ ] Database schema imported
- [ ] Environment variables updated
- [ ] Local app connects successfully
- [ ] Google OAuth configured
- [ ] Deployed to Vercel
- [ ] Production app works

## Support

- Full guide: `REBUILD_PLAN.md`
- System docs: `SYSTEM_DOCUMENTATION.md`
- Issues: Check browser console for errors
