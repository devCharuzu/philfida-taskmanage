# PhilFIDA TaskFlow - Complete Rebuild Guide

## Overview
This guide helps you rebuild your Supabase database and reconnect to production after deleting your GitHub repo and database.

## Prerequisites
- Access to Supabase Dashboard (https://supabase.com/dashboard)
- Vercel account for deployment
- New GitHub repository ready
- Admin access to configure Google OAuth

## Step 1: Create New Supabase Project

### 1.1 Set up Supabase Project
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Choose your organization
4. Project name: `philfida-taskflow` (or your preferred name)
5. Database password: Generate a strong password and save it
6. Region: Choose closest to your users (Southeast Asia recommended)
7. Click "Create new project"

### 1.2 Get Project Credentials
Once created, go to Settings > API and note:
- Project URL
- `anon` public key
- `service_role` key (keep secret)

## Step 2: Database Schema Setup

### 2.1 Run Database Schema Script
Copy and run this complete schema in Supabase SQL Editor:

```sql
-- ============================================================
-- PhilFIDA TaskFlow - Complete Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Create Users table
CREATE TABLE IF NOT EXISTS public."Users" (
  "ID" TEXT PRIMARY KEY,
  "Name" TEXT NOT NULL,
  "Email" TEXT UNIQUE NOT NULL,
  "Password" TEXT, -- For manual login (hashed)
  "Role" TEXT NOT NULL CHECK ("Role" IN ('Director', 'Unit Head', 'Employee')),
  "Unit" TEXT DEFAULT '',
  "Office" TEXT DEFAULT '',
  "Designation" TEXT DEFAULT '',
  "ProfilePic" TEXT DEFAULT '',
  "Status" TEXT DEFAULT 'Available' CHECK ("Status" IN ('Available', 'Official Travel', 'On Leave')),
  "AccountStatus" TEXT DEFAULT 'Active' CHECK ("AccountStatus" IN ('Active', 'Pending', 'Deactivated')),
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Tasks table
CREATE TABLE IF NOT EXISTS public."Tasks" (
  "TaskID" TEXT PRIMARY KEY,
  "EmployeeID" TEXT REFERENCES public."Users"("ID"),
  "EmployeeName" TEXT NOT NULL,
  "Title" TEXT NOT NULL,
  "Instructions" TEXT NOT NULL,
  "FileLink" TEXT DEFAULT '',
  "Status" TEXT DEFAULT 'Assigned' CHECK ("Status" IN ('Assigned', 'Received', 'Completed')),
  "Archived" TEXT DEFAULT 'FALSE' CHECK ("Archived" IN ('TRUE', 'FALSE')),
  "Deadline" TIMESTAMP WITH TIME ZONE,
  "Priority" TEXT DEFAULT 'Normal' CHECK ("Priority" IN ('Low', 'Normal', 'High', 'Urgent')),
  "Category" TEXT DEFAULT '',
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "ReceivedAt" TIMESTAMP WITH TIME ZONE,
  "CompletedAt" TIMESTAMP WITH TIME ZONE
);

-- Create Comments table
CREATE TABLE IF NOT EXISTS public."Comments" (
  "ID" SERIAL PRIMARY KEY,
  "TaskID" TEXT REFERENCES public."Tasks"("TaskID") ON DELETE CASCADE,
  "SenderName" TEXT NOT NULL,
  "SenderID" TEXT REFERENCES public."Users"("ID"),
  "Message" TEXT NOT NULL, -- Can be plain text or JSON with {text, files}
  "TimeStamp" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "HiddenBy" TEXT DEFAULT '' -- JSON array of user IDs who marked as read
);

-- Create Notifications table
CREATE TABLE IF NOT EXISTS public."Notifications" (
  "ID" SERIAL PRIMARY KEY,
  "UserID" TEXT REFERENCES public."Users"("ID") ON DELETE CASCADE,
  "Message" TEXT NOT NULL,
  "Type" TEXT DEFAULT 'info' CHECK ("Type" IN ('info', 'success', 'warning', 'error')),
  "IsRead" TEXT DEFAULT 'FALSE' CHECK ("IsRead" IN ('TRUE', 'FALSE')),
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "TaskID" TEXT REFERENCES public."Tasks"("TaskID")
);

-- Create TaskHistory table
CREATE TABLE IF NOT EXISTS public."TaskHistory" (
  "ID" SERIAL PRIMARY KEY,
  "TaskID" TEXT REFERENCES public."Tasks"("TaskID") ON DELETE CASCADE,
  "Action" TEXT NOT NULL,
  "Actor" TEXT NOT NULL,
  "ActorID" TEXT REFERENCES public."Users"("ID"),
  "Note" TEXT DEFAULT '',
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public."Users"("Email");
CREATE INDEX IF NOT EXISTS idx_users_role ON public."Users"("Role");
CREATE INDEX IF NOT EXISTS idx_users_unit ON public."Users"("Unit");
CREATE INDEX IF NOT EXISTS idx_tasks_employee ON public."Tasks"("EmployeeID");
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public."Tasks"("Status");
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON public."Tasks"("Archived");
CREATE INDEX IF NOT EXISTS idx_comments_task ON public."Comments"("TaskID");
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public."Notifications"("UserID");
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public."Notifications"("IsRead");
CREATE INDEX IF NOT EXISTS idx_taskhistory_task ON public."TaskHistory"("TaskID");

-- Enable Row Level Security
ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskHistory" ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Users policies
CREATE POLICY "Users can view all users" ON public."Users" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON public."Users" FOR UPDATE USING (auth.uid()::text = "ID");
CREATE POLICY "Users can insert new users" ON public."Users" FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Tasks policies
CREATE POLICY "Tasks are viewable by authenticated users" ON public."Tasks" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Tasks can be inserted by authenticated users" ON public."Tasks" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Tasks can be updated by authenticated users" ON public."Tasks" FOR UPDATE USING (auth.role() = 'authenticated');

-- Comments policies
CREATE POLICY "Comments are viewable by authenticated users" ON public."Comments" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Comments can be inserted by authenticated users" ON public."Comments" FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON public."Notifications" FOR SELECT USING (auth.uid()::text = "UserID");
CREATE POLICY "Users can insert own notifications" ON public."Notifications" FOR INSERT WITH CHECK (auth.uid()::text = "UserID");
CREATE POLICY "Users can update own notifications" ON public."Notifications" FOR UPDATE USING (auth.uid()::text = "UserID");

-- TaskHistory policies
CREATE POLICY "TaskHistory is viewable by authenticated users" ON public."TaskHistory" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "TaskHistory can be inserted by authenticated users" ON public."TaskHistory" FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create Storage Bucket for files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('taskflow-files', 'taskflow-files', false) 
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view files" ON storage.objects FOR SELECT USING (bucket_id = 'taskflow-files');
CREATE POLICY "Anyone can upload files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'taskflow-files');
CREATE POLICY "Anyone can update files" ON storage.objects FOR UPDATE USING (bucket_id = 'taskflow-files');
CREATE POLICY "Anyone can delete files" ON storage.objects FOR DELETE USING (bucket_id = 'taskflow-files');

-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for Users table
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public."Users" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default Director user (password: admin123 - should be changed)
INSERT INTO public."Users" ("ID", "Name", "Email", "Password", "Role", "AccountStatus")
VALUES ('DIR-001', 'System Director', 'director@philfida.gov.ph', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsJqyX1sO', 'Director', 'Active')
ON CONFLICT ("Email") DO NOTHING;

SELECT 'Database schema created successfully ✓' as status;
```

## Step 3: Configure Authentication

### 3.1 Enable Google OAuth
1. In Supabase Dashboard, go to Authentication > Providers
2. Enable Google provider
3. Add your Google OAuth credentials:
   - Client ID: Get from [Google Cloud Console](https://console.cloud.google.com/)
   - Client Secret: Get from Google Cloud Console
4. Add redirect URL: `https://[your-project-url].vercel.app/`
5. Save configuration

### 3.2 Configure Auth Settings
1. Go to Authentication > URL Configuration
2. Site URL: `https://[your-project-url].vercel.app`
3. Redirect URLs: Add `https://[your-project-url].vercel.app/**`
4. Save changes

## Step 4: Update Environment Variables

### 4.1 Update Local Environment
Update your `.env.local` file:

```env
VITE_SUPABASE_URL=https://your-new-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-new-publishable-key
```

### 4.2 Update Production Environment
1. Push code to new GitHub repo
2. In Vercel, connect to new GitHub repo
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`: Your new Supabase URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your new publishable key

## Step 5: Deploy to Production

### 5.1 Connect GitHub to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." > "Project"
3. Import your new GitHub repository
4. Configure:
   - Framework Preset: Vite
   - Root Directory: `taskflow-app`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

### 5.2 Add Environment Variables
In Vercel project settings > Environment Variables:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key

### 5.3 Deploy
Click "Deploy" to deploy your application.

## Step 6: Initial Setup

### 6.1 Create Director Account
1. Access your deployed app
2. Sign up with Google using the director email
3. In Supabase Dashboard > Authentication > Users, update the role:
   ```sql
   UPDATE public."Users" SET "Role" = 'Director', "AccountStatus" = 'Active' WHERE "Email" = 'director@philfida.gov.ph';
   ```

### 6.2 Add Initial Users
Use the Director account to add:
- Unit Heads for each unit
- Employees as needed

## Step 7: Testing Checklist

- [ ] Google OAuth login works
- [ ] Manual login works (create test users)
- [ ] Task creation and assignment works
- [ ] File uploads work
- [ ] Realtime updates work
- [ ] Notifications work
- [ ] All user roles function correctly

## Troubleshooting

### Common Issues

1. **Legacy API Keys Error**
   - Go to Supabase Settings > API
   - Enable "Legacy API Keys" or update to new keys

2. **CORS Issues**
   - Ensure your Vercel domain is in Supabase CORS settings
   - Check Authentication > URL Configuration

3. **Realtime Not Working**
   - Ensure RLS policies allow access
   - Check browser console for connection errors

4. **File Upload Issues**
   - Verify storage bucket exists
   - Check storage policies

## Migration from Old System

If you have backups of your old database:

1. Export data from old database
2. Transform data to match new schema
3. Import using Supabase SQL Editor
4. Update user passwords (hash them properly)

## Security Notes

- Change default Director password immediately
- Use strong Supabase database password
- Keep service role key secret
- Regularly update OAuth secrets
- Monitor authentication logs

## Support

For issues:
- Supabase: https://supabase.com/docs
- Vercel: https://vercel.com/docs
- This project: Check SYSTEM_DOCUMENTATION.md in your repo
