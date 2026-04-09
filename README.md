# TaskFlow — PhilFIDA Task Management System

A comprehensive task management application for the Philippine Fiber Industry Development Authority (PhilFIDA). TaskFlow enables efficient task dispatch, tracking, and collaboration with role-based access control and real-time synchronization.

## 🎯 Overview

TaskFlow is a modern, full-featured task management system designed to streamline workflow operations across organizational hierarchies. It supports three distinct user roles (Director, Unit Head, Employee) with role-specific dashboards, real-time task updates, collaborative messaging, and file attachment capabilities.

### Key Features
- ✅ **Multi-role Access Control**: Director, Unit Head, and Employee dashboards
- ✅ **Real-time Task Sync**: Auto-polling every 15 seconds + Supabase Realtime subscriptions
- ✅ **In-task Collaboration**: Chat with file attachments and message read-state tracking
- ✅ **Task Lifecycle Management**: Assigned → Received → Completed workflow with archive support
- ✅ **File Management**: Upload, preview, and download attachments (Supabase Storage)
- ✅ **Notifications System**: Real-time notifications with sound alerts and read tracking
- ✅ **Personal Calendar**: Task deadlines + custom todo management
- ✅ **Presence Status**: Available / Official Travel / On Leave status tracking
- ✅ **User Management**: Director-controlled user approval, roles, and deactivation
- ✅ **Task Analytics**: Timeline view, task history, and bulk operations
- ✅ **Google OAuth**: Integrated Google authentication with account approval workflow

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, React Router DOM |
| **Styling** | Tailwind CSS, PostCSS |
| **State Management** | Zustand (with localStorage persistence) |
| **Backend/Database** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **Deployment** | Vercel |
| **Package Manager** | npm |

---

## 📁 Project Structure

```
taskflow-app/
├── index.html                    # Entry HTML
├── package.json                  # Dependencies & scripts
├── vite.config.js               # Vite configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── postcss.config.js            # PostCSS configuration
├── vercel.json                  # Vercel deployment config
├── supabase-migration-v2.sql    # Database schema & migrations
├── public/
│   └── google158d2925800a6a22.html  # Google verification
└── src/
    ├── main.jsx                 # App entry point & audio unlock
    ├── App.jsx                  # Route definitions & auth guards
    ├── index.css                # Tailwind imports & custom styles
    ├── pages/
    │   ├── LoginPage.jsx         # Manual login + Google OAuth
    │   ├── DashboardPage.jsx     # Employee task dashboard
    │   ├── UnitHeadPage.jsx      # Unit head monitoring & dispatch
    │   ├── DirectorPage.jsx      # Director control panel
    │   └── PersonalCalendarPage.jsx  # Task calendar & todos
    ├── components/
    │   ├── GovHeader.jsx         # PhilFIDA branding header
    │   ├── NotificationBell.jsx  # Real-time notification dropdown
    │   ├── ChatModal.jsx         # Task messaging with file support
    │   ├── CreateTaskForm.jsx    # Task dispatch form (Director/UnitHead)
    │   ├── EditTaskModal.jsx     # Task editing interface
    │   ├── EditProfileModal.jsx  # User profile updates
    │   ├── SettingsModal.jsx     # Application settings
    │   ├── DirectorProfileModal.jsx  # Director profile view
    │   ├── Lightbox.jsx          # File preview & download viewer
    │   ├── FileThumb.jsx         # File attachment thumbnails
    │   ├── TaskTimeline.jsx      # Visual task status timeline
    │   ├── PersonalCalendarSide.jsx  # Sidebar calendar widget
    │   ├── PresenceToggle.jsx    # Availability status control
    │   ├── UserManagement.jsx    # User approval & role management
    │   └── UserStatusPopover.jsx # User presence indicator
    ├── hooks/
    │   └── useSync.js            # Supabase realtime sync hook
    ├── lib/
    │   ├── supabase.js           # Supabase client initialization (PKCE auth)
    │   ├── api.js                # Database & storage operations
    │   └── notifSound.js         # Notification audio player
    └── store/
        └── useStore.js           # Zustand global state (persisted to localStorage)
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (https://nodejs.org)
- **npm** or **yarn**
- **Supabase project** with configured tables and auth (see [Database Setup](#database-setup))

### Local Development

```bash
# 1. Navigate to project directory
cd taskflow-app

# 2. Install dependencies
npm install

# 3. Create .env.local with Supabase credentials
# (Copy from src/lib/supabase.js if using development keys)

# 4. Start development server
npm run dev

# 5. Open browser
# http://localhost:5173

# Test Login Credentials
# Username: test_user
# Password: test_password
```

### Available Scripts

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview production build locally
```

---

## 📦 Deployment

### Option 1: Vercel (Recommended)

#### Via Vercel CLI
```bash
# 1. Install Vercel CLI globally
npm install -g vercel

# 2. Login to Vercel (opens browser)
vercel login

# 3. Deploy from taskflow-app folder
cd taskflow-app
npm run build
vercel --prod
```

#### Via GitHub (Automatic)
1. Push repository to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. **Import** the GitHub repository
4. Set **Root Directory** to `taskflow-app`
5. Add environment variables (Supabase keys)
6. Click **Deploy**

### Deployment Configuration
- **Build Command**: `npm ci && npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm ci --legacy-peer-deps`
- **Rewrites**: All non-asset routes rewrite to `index.html` (SPA support)

---

## 🔐 Authentication & Authorization

### Login Methods

#### Manual Login
- **Username**: Personnel ID
- **Password**: Stored in Supabase `Users` table
- Validates `AccountStatus` (Active/Pending/Deactivated)

#### Google OAuth
- **Provider**: Google Auth via Supabase
- **Flow**: PKCE (Proof Key for Code Exchange) for security
- **New Users**: Auto-created with `Role: 'Employee'` and `AccountStatus: 'Pending'`
- **First-time**: Requires Director approval before full access

### User Roles & Permissions

| Role | Capabilities |
|------|-------------|
| **Director** | Full system control, user management, task dispatch to all units, archive management, view all analytics |
| **Unit Head** | Unit monitoring, assign tasks to unit employees, view unit-specific data, accept/complete tasks, manage unit calendar |
| **Employee** | Personal task dashboard, accept/complete tasks, view deadlines, in-task chat, personal calendar |

### Session Management
- **Persistence**: Session stored in localStorage under `philfida_session` via Zustand
- **Hydration**: App hydrates on load and redirects based on role
- **Expiration**: Handled by Supabase Auth

---

## 💾 Database & Storage

### Supabase Integration

#### Key Tables
- **Users** — Personnel information, roles, account status
- **Tasks** — Task definitions, status, deadlines, assignments
- **Comments** — Task messages, file attachments (JSON-stored)
- **Notifications** — User notifications with type and read status
- **TaskHistory** — Audit log of task actions and changes

#### Storage Bucket
- **Bucket Name**: `taskflow-files`
- **Usage**: Task attachments, chat file uploads
- **File URLs**: Joined by `|` separator in database

#### Database Schema
See [supabase-migration-v2.sql](./taskflow-app/supabase-migration-v2.sql) for complete schema including:
- Column definitions for all tables
- Relationships and indexes
- Unit and AccountStatus enum backfills

### Real-time Synchronization
- **Subscriptions**: Tasks, Comments, Notifications, Users
- **Polling Fallback**: Every 30 seconds
- **Message Format**: JSON for attachments and complex data structures

---

## 🎨 Styling & Branding

- **CSS Framework**: Tailwind CSS 3.4.10
- **Fonts**: DM Sans (Google Fonts)
- **Icons**: Bootstrap Icons
- **Brand Colors**: PhilFIDA government green/blue scheme
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints

---

## 🔑 Important Implementation Notes

### Session & State
- **Session Object**: Contains user data (ID, Name, Email, Role, Unit, etc.)
- **Global Data**: Fetched from Supabase after login, stored in Zustand
- **Persistence**: Only `session` object persists; `globalData` refetches on each session

### File Handling
- **Upload**: Via `uploadFiles()` in [src/lib/api.js](./taskflow-app/src/lib/api.js)
- **Storage**: Supabase Storage bucket with public URLs
- **Chat Attachments**: Embedded as JSON `{ text, files }` in Message column
- **Preview**: `Lightbox.jsx` component handles rendering and downloads

### Audio & Notifications
- **Sound**: Plays on first user interaction (unlocked via click in `main.jsx`)
- **Notifications**: Real-time updates with read-state tracking
- **Notification Types**: Task assignment, comments, status changes

### Environment Configuration
- **Supabase Keys**: Currently hardcoded in [src/lib/supabase.js](./taskflow-app/src/lib/supabase.js)
- **PKCE Auth**: Configured with `detectSessionInUrl: false` for security
- **Callback Handling**: Manual parsing of OAuth callback data (code exchange)

---

## 📚 Core Features Explained

### Task Workflow
1. **Dispatch** (Director/Unit Head) — Create task with priority, deadline, attachments
2. **Receive** (Employee) — Accept task to start progress
3. **Complete** (Employee) — Mark task finished with notes
4. **Archive** — Director can hide completed tasks; restore/delete available

### Real-time Chat
- In-task messaging with read-state indicators
- File attachment support (images, PDFs, documents)
- Stored as plain text or JSON with file references

### Presence Management
- **Status Options**: Available, Official Travel, On Leave
- **Visual Indicators**: User status popover in headers
- **Sync**: Updates reflect across all pages in real-time

### Personal Calendar
- **Storage**: Browser localStorage (`pf_calendar_{userId}`, `pf_todos_{userId}`)
- **Features**: Task deadline sync, custom todos, drag-to-reschedule
- **Isolation**: Per-user events and todos

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Blank screen on load | Wait for Zustand hydration; check console for auth errors |
| Files not uploading | Verify Supabase Storage bucket is public; check CORS settings |
| Notifications not appearing | Check Supabase Realtime subscriptions; verify email in Users table |
| Google login fails | Confirm Google OAuth app is configured in Supabase; check redirect URLs |
| Sync delays | Normal (15-30s poll); check network tab for Supabase latency |

---

## 📋 Development Checklist

- [ ] Node.js 18+ installed
- [ ] Supabase project created and configured
- [ ] Google OAuth credentials added to Supabase
- [ ] Environment variables set (Supabase URL & Key)
- [ ] Database migrations applied
- [ ] Admin user created for testing
- [ ] Local dev server running (`npm run dev`)
- [ ] Tested all three user roles
- [ ] Notifications working
- [ ] File uploads functional

---

## 📞 Support & Documentation

For detailed system architecture, database mappings, and advanced configurations, see:
- [SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md) — Comprehensive technical documentation
- [Supabase Documentation](https://supabase.com/docs) — Backend setup & configuration
- [React Documentation](https://react.dev) — Frontend framework
- [Tailwind CSS](https://tailwindcss.com/docs) — Styling utility framework

---

## 📄 License

Internal PhilFIDA Project. All rights reserved.

---

**Last Updated**: April 2026 | **Version**: 1.0.0
