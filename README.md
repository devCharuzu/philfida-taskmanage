# TaskFlow — PhilFIDA Task Management System

## Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Supabase Storage
- **Deployment**: Vercel (frontend)

---

## Local Development

### Prerequisites
- Node.js 18+ (nodejs.org)
- VS Code

### Steps

```bash
# 1. Install dependencies
cd taskflow-app
npm install

# 2. Start dev server
npm run dev
# Opens at http://localhost:5173
```

---

## Deploy to Vercel

### Option A — Via Vercel CLI (recommended)
```bash
# Install Vercel CLI
npm install -g vercel

# Login (opens browser)
vercel login

# Deploy from taskflow-app folder
cd taskflow-app
npm run build
vercel --prod
```

### Option B — Via GitHub
1. Push this folder to a GitHub repository
2. Go to vercel.com → New Project
3. Import the GitHub repo
4. Set **Root Directory** to `taskflow-app`
5. Click Deploy

---

## Project Structure

```
taskflow-app/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx         ✅ Government login
│   │   ├── DashboardPage.jsx     ✅ Employee dashboard
│   │   └── DirectorPage.jsx      ✅ Director panel
│   ├── components/
│   │   ├── GovHeader.jsx         ✅ PhilFIDA top header
│   │   ├── NotificationBell.jsx  ✅ Notification dropdown
│   │   ├── ChatModal.jsx         ✅ Task chat with file support
│   │   ├── Lightbox.jsx          ✅ File viewer/downloader
│   │   ├── FileThumb.jsx         ✅ File thumbnails
│   │   ├── CreateTaskForm.jsx    ✅ Dispatch task form
│   │   └── EditTaskModal.jsx     ✅ Edit task modal
│   ├── hooks/
│   │   └── useSync.js            ✅ Auto-polling every 15s
│   ├── lib/
│   │   ├── supabase.js           ✅ Supabase client
│   │   └── api.js                ✅ All DB + storage operations
│   ├── store/
│   │   └── useStore.js           ✅ Zustand global state
│   ├── App.jsx                   ✅ Routing + auth guards
│   ├── main.jsx                  ✅ Entry point
│   └── index.css                 ✅ Tailwind + PhilFIDA design
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Notes
- Session is persisted in localStorage under `philfida_session`
- All file uploads go to Supabase Storage bucket `taskflow-files`
- Chat messages with files are stored as JSON in the Message column
- Auto-sync polls every 15 seconds
