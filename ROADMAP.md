# PMC CONNEXT Web Application - Roadmap & Architecture

This document serves as the master guide for any developer or AI assistant working on the PMC CONNEXT web application project.

## Core Objective
To build a fully functional Construction Management Web Application for a 20-user team, completely eliminating the need for a traditional backend database. 
- **Database Layer**: Google Sheets (via Google Sheets API v4)
- **File Storage**: Google Drive (via Google Drive API v3)
- **Authentication**: NextAuth (Google OAuth2 - purely for user identity)
- **Framework**: Next.js App Router (React)
- **Styling**: Tailwind CSS, Lucide React

## Architecture: Next.js + Service Account
To maintain security and avoid the hassle of Google's OAuth verification screens, we use a **Backend-for-Frontend** pattern:
1. **Frontend**: The user signs in using their Google Workspace account via NextAuth.
2. **Backend (API Routes)**: Our Next.js API routes act as the intermediary. 
3. **Service Account**: The API routes use a Google Cloud Service Account (`credentials.json` loaded via `.env.local`) to authenticate with Google APIs. This allows the server to read/write to the central Google Sheet and Drive without the user needing direct Editor access.

## Google Sheets Structure (Target Schema)
The target Spreadsheet (`GOOGLE_SHEET_ID`) uses the following schema:
- `Projects`: project_id, name, client, start_date, end_date, status, budget, drive_folder_id, created_at, updated_at
- `Tasks`: task_id, project_id, name, assignee, start, end, status, percent_done, created_at, updated_at
- `Daily_Reports`: report_id, project_id, date, weather, workers, work_done, issues, photos_folder_id, created_at, updated_at
- `Budget`: budget_id, project_id, category, planned, actual, variance, created_at, updated_at
- `Materials`: material_id, project_id, name, unit, qty_plan, qty_actual, cost, created_at, updated_at
- `Team`: member_id, name, role, phone, email, project_ids, created_at, updated_at
- `Issues`: issue_id, project_id, title, priority, status, due_date, owner, created_at, updated_at

## Google Drive Structure
When a project is created, the system auto-generates the following folder structure inside the `GOOGLE_DRIVE_ROOT_FOLDER_ID`:
```text
/Construction Projects/
  ├── [{project_id} - {name}] 
  │   ├── Drawings/
  │   ├── Photos/
  │   ├── Contracts/
  │   ├── Daily Reports/
  │   └── BOQ & Budget/
```

## Implementation Phases

### Phase 1: Foundation & Auth (Completed)
- [x] Initialize Next.js, Tailwind, NextAuth.
- [x] Implement the `vehicle-login` UI from the legacy project.
- [x] Configure Google API `googleapis` service account client.

### Phase 2: Core Data Services (Completed)
- [x] Sheets CRUD Helpers (`src/lib/sheetsCrud.ts`) - `findAll`, `insert`, `update`.
- [x] Sheets Setup Helper (`src/lib/sheetsSetup.ts`) - To auto-generate tabs and columns.
- [x] Drive Helper (`src/lib/drive.ts`) - To create hierarchical project folders and handle uploads.
- [x] LINE Notification Helper (`src/lib/line.ts`).

### Phase 3: Project & Team Management (In Progress)
- [x] Dashboard Overview UI (`/dashboard`).
- [x] Project List UI (`/dashboard/projects`).
- [x] Create Project Form & API Route (`/api/projects` -> provisions Drive & Sheets).
- [ ] Team Module (Manage users, restrict roles).

### Phase 4: Operations Modules (Pending)
- [ ] Daily Reports (Form with Drive Photo uploads -> `Daily_Reports` Sheet).
- [ ] Task Tracker (Gantt/Kanban view -> `Tasks` Sheet).
- [ ] Issues & RFI (Issue log with LINE alerts -> `Issues` Sheet).
- [ ] Budget & Materials (Finance tracking -> `Budget` & `Materials` Sheets).

### Phase 5: Polish & Optimizations (Pending)
- [ ] Client-side caching (SWR/React Query) to mask Sheets API latency.
- [ ] Enhanced Mobile responsiveness for on-site engineers.
- [ ] PDF generation for Daily Reports before uploading to Drive.

## AI Developer Guidelines
1. **Never use Prisma, Supabase, Firebase, or MongoDB**. Google Sheets IS the database.
2. **Never expose the Service Account private key**. All Sheets/Drive logic must remain in `src/lib/` and only be imported inside `src/app/api/` routes or Server Components.
3. **Handle API Rate Limits**: Google Sheets API has quotas. Batch your reads/writes when possible.
4. **Resilience**: Always assume a Sheet fetch might fail or return empty. Use safe fallbacks in the UI.
5. **Brand Styling**: The brand tone should be clean and professional (White backgrounds, gray borders, orange accents). Use the `vehicle-login-*` styles as a reference for premium UI blocks.
