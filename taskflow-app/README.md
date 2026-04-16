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

## � Known Issues and Potential Problems

### Security Vulnerabilities
- **Vulnerabilities in Dependencies**: The project has 2 moderate severity vulnerabilities in `esbuild` and `vite` (as of April 2026). Run `npm audit` to check current status. Consider updating dependencies:
  ```bash
  npm update
  # Or for major updates
  npm install vite@latest esbuild@latest
  ```
- **Hardcoded Supabase Keys**: Although the code uses environment variables, ensure `.env.local` is not committed to version control. Add `.env.local` to `.gitignore`.

### Setup and Configuration Issues
- **Supabase Project Required**: The app requires a Supabase project with specific tables, auth setup, and storage bucket. Without proper Supabase configuration, authentication and data operations will fail.
- **Google OAuth Setup**: Google login requires:
  - Google OAuth app configured in Supabase Auth settings.
  - Correct redirect URLs set in Google Console and Supabase.
  - New Google users start with `AccountStatus: 'Pending'` and need Director approval.
- **Database Migration**: Run `supabase-migration-v2.sql` in your Supabase SQL editor to add required columns (`Unit`, `AccountStatus`) and backfill data.
- **Storage Bucket**: Create a public bucket named `taskflow-files` in Supabase Storage for file uploads.

### Runtime Issues
- **Blank Screen on Load**: May occur due to Zustand hydration issues or missing session. Check browser console for auth errors. Ensure Supabase keys are correct.
- **File Upload Failures**: Verify the `taskflow-files` bucket is public and CORS is configured. Check file size limits (default 50MB in Supabase).
- **Notifications Not Appearing**: Ensure user's email is correctly stored in the `Users` table. Check Supabase Realtime subscriptions and network connectivity.
- **Sync Delays**: Real-time updates rely on Supabase Realtime; if slow, the app falls back to 30-second polling. Check Supabase dashboard for connection issues.
- **Google Login Fails**: Confirm PKCE flow is enabled in Supabase Auth. Check browser console for callback errors. Ensure `detectSessionInUrl: true` in production (note: differs from dev settings).
- **Audio Not Playing**: Notification sounds require user interaction to unlock audio context (handled in `main.jsx`). If sounds don't play, check browser audio permissions.

### Development Issues
- **No Linter Configured**: The project lacks ESLint or similar linting tools. Consider adding:
  ```bash
  npm install -D eslint @eslint/js eslint-plugin-react eslint-plugin-react-hooks
  ```
- **No Tests**: No unit or integration tests are present. Consider adding Vitest for testing.
- **Environment Variables**: Missing `.env.local` will cause build-time errors. Create it with:
  ```
  VITE_SUPABASE_URL=your_supabase_url
  VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
  ```
- **Node Version**: Requires Node.js 18+. Older versions may cause build failures.

### Performance and Scalability
- **Large Bundle Size**: The built JS bundle is ~560KB gzipped. Consider code splitting or lazy loading for better performance.
- **Realtime Subscriptions**: Subscribes to all changes in Tasks, Comments, Notifications, Users tables. In high-traffic scenarios, this could cause performance issues.
- **Polling Fallback**: 30-second poll may consume unnecessary bandwidth. Consider optimizing or removing if realtime is reliable.

### Browser Compatibility
- **LocalStorage Dependency**: Personal calendar and todos use localStorage, which may not work in private/incognito mode or if disabled.
- **Audio Context**: Notification sounds require modern browser audio APIs.

### Deployment Issues
- **Vercel Rewrites**: Ensure `vercel.json` is correctly configured for SPA routing. All routes should rewrite to `index.html`.
- **Environment Variables in Vercel**: Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings.
- **Build Failures**: If build fails, check Node.js version in Vercel (should be 18+).

### Data and Migration Issues
- **Account Status Backfill**: Migration sets existing users to `Active`, but new logic may require manual review.
- **Unit Column**: Added in migration; ensure all users have appropriate unit assignments.
- **Task History**: Audit logs are stored but not displayed in UI; may accumulate large amounts of data.

### User Experience Issues
- **No Offline Support**: App requires internet connection for all operations.
- **Session Expiration**: Handled by Supabase, but abrupt logouts may confuse users.
- **File Preview Limitations**: Lightbox supports basic file types; complex documents may not render properly.

---

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
- [SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md) — Comprehensive technical documentation
- [Supabase Documentation](https://supabase.com/docs) — Backend setup & configuration
- [React Documentation](https://react.dev) — Frontend framework
- [Tailwind CSS](https://tailwindcss.com/docs) — Styling utility framework

---

## 📄 License

Internal PhilFIDA Project. All rights reserved.

---

**Last Updated**: April 16, 2026 | **Version**: 1.1.1
