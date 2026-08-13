# 📘 PhilFIDA TaskFlow: Complete System Manual & Overview

Welcome to the **PhilFIDA TaskFlow** comprehensive manual. This document serves as the primary reference for users, administrators, and developers of the TaskFlow system.

---

## 📑 Table of Contents
1. [🌟 System Overview](#-system-overview)
2. [👥 User Manual (Guide by Role)](#-user-manual-guide-by-role)
   - [Director](#director-full-system-control)
   - [Unit Head](#unit-head-unit-monitoring--dispatch)
   - [Employee](#employee-personal-task-management)
3. [🚀 Getting Started & Setup](#-getting-started--setup)
   - [Prerequisites](#prerequisites)
   - [Local Development](#local-development)
   - [Production Deployment](#production-deployment)
4. [🛠️ Technical Architecture](#-technical-architecture)
   - [Tech Stack](#tech-stack)
   - [Project Structure](#project-structure)
   - [Authentication Flow](#authentication-flow)
   - [State Management](#state-management)
5. [🗄️ Database & Security](#-database--security)
   - [Data Model](#data-model)
   - [Row Level Security (RLS)](#row-level-security-rls)
   - [Storage](#storage)
6. [🔧 Maintenance & Troubleshooting](#-maintenance--troubleshooting)
7. [📅 Version History](#-version-history)

---

## 🌟 System Overview

**PhilFIDA TaskFlow** is a modern, real-time task management system specifically designed for the **Philippine Fiber Industry Development Authority (PhilFIDA)**. It streamlines the lifecycle of tasks from assignment to completion, fostering collaboration and accountability across different organizational levels.

### Core Value Proposition
- **Role-Based Workflows**: Tailored interfaces for Directors, Unit Heads, and Employees.
- **Real-Time Synchronization**: Instant updates on tasks, comments, and notifications using Supabase Realtime.
- **Unified Communication**: In-task chat with file attachment support.
- **Transparency**: Comprehensive task history and audit logs.
- **Accessibility**: Fully responsive design (mobile-first) for field and office use.

---

## 👥 User Manual (Guide by Role)

### Director (Full System Control)
*The Director has bird's-eye view of the entire organization.*
- **Task Monitoring**: View all active tasks across all units. Filter by status, priority, or search.
- **Task Dispatching**: Create and assign tasks directly to any personnel or unit.
- **User Management**: Approve new accounts (Google OAuth users), update roles, or deactivate personnel.
- **Archive Management**: Move completed tasks to archives; perform bulk restore or permanent deletion.
- **Analytics**: View task timelines and personnel availability status.

### Unit Head (Unit Monitoring & Dispatch)
*Unit Heads manage their specific team's workload.*
- **Team Oversight**: Monitor tasks assigned to personnel within their unit.
- **Internal Dispatching**: Assign tasks to members of their own unit.
- **Collaborative Support**: Accept or mark tasks as completed on behalf of their unit members if necessary.
- **Unit Calendar**: View upcoming deadlines and availability for their unit.

### Employee (Personal Task Management)
*Employees focus on executing assigned tasks.*
- **Task Dashboard**: A focused list of personal assignments.
- **Status Updates**: Accept tasks (mark as "Received") and complete them (mark as "Completed").
- **Communication**: Use the built-in chat for each task to ask questions or provide updates.
- **File Management**: Upload deliverables or reference documents directly to a task.
- **Personal Tools**: Use the integrated Calendar and Todo list for personal organization.

---

## 🚀 Getting Started & Setup

### Prerequisites
- **Node.js**: Version 18 or higher.
- **Supabase Account**: A project with Database, Auth, Storage, and Realtime enabled.
- **Google Cloud Console**: (Optional) For Google OAuth integration.

### Local Development
1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd philfida-taskmanage/taskflow-app
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment**:
   Create a `.env.local` file in the `taskflow-app` directory:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```
4. **Run the App**:
   ```bash
   npm run dev
   ```
   Access the app at `http://localhost:5173`.

### Production Deployment
TaskFlow is optimized for **Vercel**.
1. Set the Root Directory to `taskflow-app`.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to Vercel Environment Variables.
3. Deploy. Vercel will handle the SPA routing via the included `vercel.json`.

---

## 🛠️ Technical Architecture

### Tech Stack
- **Frontend**: React 18 with Vite.
- **Styling**: Tailwind CSS (PhilFIDA Brand Guidelines).
- **State**: Zustand (with `localStorage` persistence for session).
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime).
- **Persistence**: 
  - `session`: Zustand Persist.
  - `calendar/todos`: Native LocalStorage (`pf_calendar_{uid}`).

### Project Structure
```text
taskflow-app/
├── src/
│   ├── pages/         # High-level route components (DirectorPage, etc.)
│   ├── components/    # Reusable UI (Chat, TaskForm, NotificationBell)
│   ├── lib/           # Supabase client and API wrapper (api.js)
│   ├── store/         # Zustand global state (useStore.js)
│   ├── hooks/         # Custom hooks (useSync.js for Realtime)
│   └── main.jsx       # Entry point & Audio Context unlock
├── public/            # Static assets
└── index.html         # SPA Template
```

### Authentication Flow
1. **Manual Login**: Personnel ID + Password. Validated via `Users` table lookup in `api.js`.
2. **Google OAuth**: 
   - Uses Supabase Auth (PKCE flow).
   - New users are auto-created as `Role: Employee` and `AccountStatus: Pending`.
   - Requires Director approval before full access.

### State Management
- `session`: Contains the currently logged-in user's profile.
- `globalData`: Contains all tasks, users, comments, and notifications fetched from the database. Refetched on every sync event.

---

## 🗄️ Database & Security

### Data Model
- **`Users`**: Primary personnel registry.
- **`Tasks`**: Task definitions and statuses.
- **`Comments`**: Real-time messaging thread.
- **`Notifications`**: User-specific alerts.
- **`TaskHistory`**: Audit log for task lifecycle events.

### Row Level Security (RLS)
The system uses a combination of standard RLS and **Security Definer RPCs**.
- **Public/Anon**: Limited access for login and self-registration.
- **Authenticated**: Standard access for Employees and Unit Heads.
- **Director**: Special RPCs (`director_set_account_status`, etc.) bypass standard RLS to allow user management.

### Storage
- Bucket: `taskflow-files`.
- Access: Signed URLs (1-hour expiry) generated on-the-fly for security.
- Pathing: `uploads/timestamp_random.ext`.

---

## 🔧 Maintenance & Troubleshooting

### Common Tasks
- **Updating Schema**: Run SQL scripts found in the root directory (e.g., `supabase-migration-v2.sql`) in the Supabase SQL Editor.
- **Audio Issues**: Modern browsers block audio until user interaction. The app "unlocks" audio on the first click in `main.jsx`.
- **Sync Delays**: Realtime updates depend on WebSocket stability. The app falls back to a 30-second poll if the connection is interrupted.

### Troubleshooting Table
| Symptom | Probable Cause | Action |
|---------|----------------|--------|
| Blank Screen | Auth/Zustand Hydration Error | Clear LocalStorage and refresh. |
| Files not showing | Signed URL expiry | Refresh the page to generate new links. |
| No notifications | Realtime subscription failed | Check internet connection; wait for 30s poll. |
| Login rejected | Account Status: Pending | Contact the Director for account approval. |

---

## 📅 Version History
- **v1.0.0**: Initial release with core task management.
- **v1.1.0**: Added Google OAuth and Account Approval workflow.
- **v1.1.1**: Responsive UI overhaul and initials-based profile system.

---
**Last Updated**: May 2026
**PhilFIDA IT Team**
