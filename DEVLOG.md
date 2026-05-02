# Development Log

## 2026-05-02 - Next.js Setup & Data Layer Foundation

### Accomplished
1. **Next.js Initialization**: Scaffolded a Next.js App Router project using Tailwind CSS in the `webapp` folder.
2. **Auth Layer**: Configured `next-auth` with the `Credentials` Provider. Ported over the legacy `vehicle-login` CSS into `globals.css` and recreated the UI in `app/page.tsx` using email and password. It checks credentials against the `Team` sheet.
3. **Google API Clients**: Created `src/lib/google.ts` to initialize `googleapis` using a Service Account for both Sheets (v4) and Drive (v3).
4. **Sheets Data Layer**:
   - Built `src/lib/sheetsSetup.ts` containing `ensureSchema()`, which automatically creates the necessary tabs (`Projects`, `Tasks`, `Daily_Reports`, `Budget`, `Materials`, `Team`, `Issues`) and their headers if they don't exist.
   - Built `src/lib/sheetsCrud.ts` containing generic `findAll`, `insert`, and `update` functions.
5. **Drive Storage Layer**:
   - Built `src/lib/drive.ts` containing `setupProjectFolders()`, which automatically creates a parent project folder and subfolders (`Drawings`, `Photos`, `Contracts`, etc.) inside the root directory.
6. **LINE Notifications**: Built `src/lib/line.ts` to support push messages via LINE API.
7. **Project UI**:
   - Created `app/dashboard/layout.tsx` to provide the main sidebar/topbar shell.
   - Created `app/dashboard/page.tsx` for the project overview stats.
   - Created `app/dashboard/projects/page.tsx` for the project list (Server Component).
   - Created `app/dashboard/projects/new/page.tsx` for the project creation form.
   - Created `app/api/projects/route.ts` (API Route) to handle the actual creation logic (provisioning Drive folders, then inserting into Sheets).
8. **Environment Configuration**: Generated `.env.local` scaffolding for the target Sheet ID, Drive Root Folder ID, and LINE credentials.

### Pending/Next Actions
- **Service Account Credentials**: The system requires the user to generate a Google Cloud Service Account, grant it Editor access to the Target Sheet and Drive Root Folder, and inject `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` into `.env.local`.
- **Implement Team Module**: Read users from the `Team` sheet to manage roles and assignments.
- **Implement Daily Report**: Form UI with file input, converting files to Buffers, and uploading them to the specific project's "Daily Reports" Drive folder via `uploadFile` in `drive.ts`.
