# TaskFlow — PhilFIDA Task Management System

A comprehensive task management application for the Philippine Fiber Industry Development Authority (PhilFIDA). TaskFlow enables efficient task dispatch, tracking, and collaboration with role-based access control and real-time synchronization.

## 🎯 Overview

TaskFlow is a modern, full-featured task management system designed to streamline workflow operations across organizational hierarchies. It supports three distinct user roles (Director, Unit Head, Employee) with role-specific dashboards, real-time task updates, collaborative messaging, and file attachment capabilities.

### Key Features
- **Multi-role Access Control**: Director, Unit Head, and Employee dashboards
- **Comprehensive Responsive Design**: Fluid scaling from mobile (320px) to ultra-wide (1920px+)
- **Real-time Task Sync**: Auto-polling every 30 seconds + Supabase Realtime subscriptions
- **In-task Collaboration**: Chat with file attachments and message read-state tracking
- **Task Lifecycle Management**: Assigned → Received → Completed workflow with archive support
- **File Management**: Upload, preview, and download attachments (Supabase Storage)
- **Notifications System**: Real-time notifications with sound alerts and read tracking
- **Personal Calendar**: Task deadlines + custom todo management
- **Presence Status**: Available / Official Travel / On Leave status tracking
- **User Management**: Director-controlled user approval, roles, and deactivation
- **Initials-based Profiles**: Clean, fast-loading user avatars using initials only
- **Task Analytics**: Timeline view, task history, and bulk operations
- **Google OAuth**: Integrated Google authentication with account approval workflow
- **Touch-friendly Interface**: Optimized for mobile devices with proper touch targets
- **Modern UI Components**: Consistent design system with PhilFIDA branding

### Security Features
- **Supabase Auth (PKCE/OAuth2)**: Secure authentication for all users
- **Role-Based Access Control (RBAC)**: Permissions enforced by role
- **Row Level Security (RLS)**: Data access enforced at the database level
- **Account Approval Workflow**: Director approval required for new users
- **Session Management**: Secure session storage and validation
- **Strict CSP & CORS**: Security headers enforced in deployment
- **File Upload Restrictions**: 50MB max, validated and signed URLs
- **Audit Logging**: All major actions are logged

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
│   └── philfida-logo.png            # PhilFIDA logo asset
└── src/
    ├── main.jsx                 # App entry point & audio unlock
    ├── App.jsx                  # Route definitions & auth guards
    ├── index.css                # Tailwind imports & custom styles
  ├── ui-enhancements.css      # Extra UI overrides
    ├── pages/
    │   ├── LoginPage.jsx         # Manual login + Google OAuth
    │   ├── DashboardPage.jsx     # Employee task dashboard
    │   ├── UnitHeadPage.jsx      # Unit head monitoring & dispatch
    │   ├── DirectorPage.jsx      # Director control panel
  │   ├── RecordsPage.jsx       # Task records/archive
  │   └── PersonalCalendarPage.jsx  # Task calendar & todos
    ├── components/
    │   ├── GovHeader.jsx         # PhilFIDA branding header
    │   ├── NotificationBell.jsx  # Real-time notification dropdown
  │   ├── NotificationCenter.jsx# Notification center modal
    │   ├── ChatModal.jsx         # Task messaging with file support
    │   ├── CreateTaskForm.jsx    # Task dispatch form (Director/UnitHead)
    │   ├── EditTaskModal.jsx     # Task editing interface
    │   ├── EditProfileModal.jsx  # User profile updates
    │   ├── SettingsModal.jsx     # Application settings
    │   ├── DirectorProfileModal.jsx  # Director profile view
    │   ├── Lightbox.jsx          # File preview & download viewer
    │   ├── FileThumb.jsx         # File attachment thumbnails
    │   ├── TaskTimeline.jsx      # Visual task status timeline
  │   ├── DeadlineProgress.jsx  # Task deadline progress bar
    │   ├── PersonalCalendarSide.jsx  # Sidebar calendar widget
    │   ├── PresenceToggle.jsx    # Availability status control
    │   ├── UserManagement.jsx    # User approval & role management
    │   └── UserStatusPopover.jsx # User presence indicator
    ├── hooks/
    │   └── useSync.js            # Supabase realtime sync hook
    ├── lib/
    │   ├── supabase.js           # Supabase client initialization (PKCE auth)
    │   ├── api.js                # Database & storage operations
  │   ├── pushNotifications.js  # Browser push notification logic
    │   └── notifSound.js         # Notification audio player
    └── store/
        └── useStore.js           # Zustand global state (persisted to localStorage)
  ├── styles/
  │   ├── components.css        # Component-level styles
  │   ├── design-system.css     # Design system tokens
  │   └── layout.css            # Layout-specific styles
  ├── skills/
  │   ├── supabase/             # Supabase SQL best practices & RLS
  │   └── supabase-postgres-best-practices/
```
---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (https://nodejs.org)
- **npm** or **yarn**
- **Supabase project** with configured tables and auth (see [Database Setup](#database-setup))

> **Note:** Node.js 20.x is recommended (see `package.json`).

> **Tip:** Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials.

### Local Development

```bash
# 1. Navigate to project directory
cd taskflow-app

# 2. Install dependencies
npm install

# 3. Create .env.local with Supabase credentials
# (Copy from src/lib/supabase.js if using development keys)

# 3.1. Or copy the example file:
cp .env.local.example .env.local

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

### Additional Scripts

```bash
# Linting and testing are not configured by default. See Known Issues for suggestions.
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
**Tasks** — Task definitions, status, deadlines, assignments, region
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
- Unit, Region, and AccountStatus enum backfills

### Real-time Synchronization
- **Subscriptions**: Tasks, Comments, Notifications, Users
- **Polling Fallback**: Every 30 seconds
- **Message Format**: JSON for attachments and complex data structures

### Region Support
- **Region column**: Both Users and Tasks now support a `Region` column for filtering and assignment.

---

## 🎨 Styling & Branding

- **CSS Framework**: Tailwind CSS 3.4.10 with custom configuration
- **Fonts**: DM Sans (Google Fonts)
- **Icons**: Bootstrap Icons
- **Brand Colors**: PhilFIDA green/gold government scheme
- **Responsive System**: Comprehensive fluid scaling (320px - 1920px+)
- **Breakpoints**: xs(475px), sm(640px), md(768px), lg(1024px), xl(1280px), 2xl(1536px), 3xl(1920px)
- **Mobile-First**: Touch-friendly targets (44px minimum), safe area support
- **Component System**: Responsive utilities for buttons, inputs, modals, tables

### Responsive Features
- **Fluid Typography**: Scales from 14px to 20px across screen sizes
- **Adaptive Layouts**: Sidebar, main content, and modals scale intelligently
- **Touch Optimization**: Larger tap targets on mobile devices
- **Ultra-wide Support**: Optimized for 4K and ultra-wide displays
- **Container Utilities**: Smart padding and max-width management
- **Print Styles**: Clean documentation printing support

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

> **Tip:** Use `.env.local` for all secrets. Never commit this file.

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

| Region errors | Ensure Region column is set for all users and tasks |

---

## 🛡️ Security Features

TaskFlow implements several security features to protect user data and system integrity:

- **Supabase Auth (PKCE/OAuth2)**: All authentication uses Supabase Auth, supporting both manual login and Google OAuth with PKCE (Proof Key for Code Exchange) for secure token exchange.
- **Role-Based Access Control (RBAC)**: All major actions are restricted by user role (Director, Unit Head, Employee) both in the UI and at the database level.
- **Row Level Security (RLS)**: Supabase tables are protected with RLS policies, ensuring users can only access data they are authorized to see or modify.
- **Account Approval Workflow**: New Google OAuth users are set to `Pending` and require Director approval before gaining access.
- **Session Management**: Sessions are securely persisted in localStorage and validated on every app load. Supabase handles session expiration and invalidation.
- **Password Hashing**: User passwords are stored securely in the database (ensure hashing is enabled in production).
- **Environment Variables**: All secrets (Supabase keys, etc.) are stored in `.env.local` and never committed to version control.
- **CORS and Content Security Policy**: Deployment config (see `vercel.json`) enforces strict CSP, X-Frame-Options, and CORS headers.
- **File Upload Restrictions**: File uploads are limited to 50MB per file and validated before upload. Files are stored in a dedicated Supabase Storage bucket with signed URLs for access.
- **Audit Logging**: All major actions (task changes, user management) are logged in the `TaskHistory` table for traceability.
- **Notification Permissions**: Browser push notifications require explicit user permission.
- **No External Avatar Services**: All profile images are generated locally (no external avatar API calls).

## Recent Improvements (April 2026)

### Bug Fixes (April 16, 2026)
- **ProfilePic Consistency**: Removed external ui-avatars.com service dependency. All profile pictures now use initials-based avatars as documented, improving performance and privacy.
- **Form Submission Fix**: Removed duplicate onKeyDown handler in LoginPage that could cause double form submission on Enter key press.
- **Code Cleanup**: Standardized ProfilePic handling across registerUser, updateProfile, EditProfileModal, and DirectorProfileModal.

### Responsive System Overhaul
- **Complete UI Responsiveness**: Fluid scaling from 320px to 1920px+
- **Touch-Friendly Design**: 44px minimum touch targets for mobile
- **Adaptive Components**: Responsive buttons, inputs, modals, and tables
- **Fluid Typography**: Dynamic font sizing across all breakpoints
- **Ultra-Wide Support**: Optimized for 4K and ultra-wide displays
- **Safe Area Support**: Compatible with notched phones and tablets

### User Profile System
- **Initials-Based Avatars**: Replaced external avatar services with clean initials
- **Consistent Design**: All user profiles use same styling approach
- **Fast Loading**: No external dependencies for profile pictures
- **Accessibility**: Better contrast and readability

### Login Form Improvements
- **Fixed Input Overlap**: Proper padding for icon placeholders
- **Responsive Layout**: Adapts beautifully across all screen sizes
- **Touch Optimization**: Larger tap targets on mobile devices

### Component Enhancements
- **Modern CSS Architecture**: Comprehensive responsive utility classes
- **Better Mobile Experience**: Improved navigation and interactions
- **Performance Optimizations**: Reduced external dependencies
- **Consistent Branding**: Unified PhilFIDA green/gold theme

---

## Development Checklist

- [x] Node.js 18+ installed
- [x] Supabase project created and configured
- [x] Google OAuth credentials added to Supabase
- [x] Environment variables set (Supabase URL & Key)
- [x] Database migrations applied (`supabase-migration-v2.sql`)
- [x] Storage bucket `taskflow-files` created and made public
- [x] Admin user created for testing
- [x] Responsive system implemented across all components
- [x] Initials-based profile system deployed
- [x] Login form input overlap fixed
- [x] Mobile touch targets optimized
- [x] Local dev server running (`npm run dev`)
- [x] Tested all three user roles
- [x] Notifications working
- [x] File uploads functional
- [x] ProfilePic external service dependency removed
- [x] Duplicate form submission bug fixed

---

## 📞 Support & Documentation

For detailed system architecture, database mappings, and advanced configurations, see:
- [PHILFIDA_TASKFLOW_MANUAL.md](./PHILFIDA_TASKFLOW_MANUAL.md) — Complete System Manual & User Guide
- [SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md) — Comprehensive technical documentation

- [skills/supabase/](./skills/supabase/) — Supabase SQL and RLS best practices

- [Supabase Documentation](https://supabase.com/docs) — Backend setup & configuration
- [React Documentation](https://react.dev) — Frontend framework
- [Tailwind CSS](https://tailwindcss.com/docs) — Styling utility framework

---

## 📄 License

Internal PhilFIDA Project. All rights reserved.

---

**Last Updated**: April 16, 2026 | **Version**: 1.1.1
**Patch Update**: May 13, 2026 — README updated for new files, region support, config notes, and security features.
