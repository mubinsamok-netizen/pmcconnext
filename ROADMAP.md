# PMC CONNEXT Web Application - Roadmap & Architecture

## Core Objective
To build a high-performance Construction Management Web Application. During the demo phase, Google Sheets is used as the temporary working data layer and Google Drive is used for file storage. In the future production direction, core structured data should move to Supabase/Postgres while Google Drive remains the storage home for files, photos, attachments, and project folders.

## Architecture: Master Workspace + Separate Site Data
The current direction is one web application with a central Master Sheet and separated site-level storage for the demo phase, with a planned path to Supabase for the production data layer.

1. **Current Demo Data Layer: Master Sheet (`GOOGLE_MASTER_SHEET_ID`)**
   - Stores workspace-level registries: `Projects`, `Team`, `UserSites`, and `Customers`.
   - `Projects` now stores the project registry plus detail metadata: project type, description, address, province, district, contract number, map link, PM/SE, cover metadata, `site_sheet_id`, `drive_folder_id`, `sales_stage`, and `deposit_status`.
   - `Customers` stores Sales CRM leads, interest/status, unlimited contact logs JSON, deposit handoff metadata, and soft-close state.
   - Powers the Workspace dashboard, site list, Sales CRM, and Admin-only team management.
   - Controls which users can access which sites.
   - This is intentionally kept for demos and fast workflow validation before the production database migration.

2. **Current Demo Site Data: Site Sheet + Site Drive Folder**
   - Each site/project can point to its own `site_sheet_id` and `drive_folder_id`.
   - Site modules read and write to the selected site's data source after resolving `project_id`.
   - If a site sheet is not created yet, the system falls back to the legacy `GOOGLE_SHEET_ID` so development can continue.
   - Site Sheets are temporary demo data stores; Drive folders remain part of the long-term architecture.

3. **Future Production Data Layer: Supabase + Google Drive**
   - Move structured records from Master/Site Sheets into Supabase/Postgres tables once the demo workflow is validated.
   - Use Supabase as the source of truth for records that need reliable multi-user editing, filtering, permissions, reporting, audit history, and future realtime behavior.
   - Keep Google Drive for large binary assets and team-facing document workflows: images, site photos, PDFs, Office files, generated exports, and shared project folders.
   - Store Drive references in Supabase rows, such as `drive_folder_id`, `drive_file_id`, `file_name`, `mime_type`, owner, and timestamps.
   - Avoid treating Drive folder names or file names as the database; Drive should store files, while Supabase stores application state and metadata.

4. **Navigation Model**
   - Workspace/Master sidebar: Dashboard, Sites, Sales CRM, Team.
   - Site sidebar: Project Overview, Project Details, Daily Reports, Schedule, Payment Requests, RFA, RFI, Defect, Files.

5. **Superseded Direction**
   - The earlier "1 Site = 1 Web App / Deployment" idea is no longer the primary implementation path.
   - Keep one app deployment and separate data per site through the current Sheet/Drive references during demo, then through Supabase records plus Drive references in production.

## Implementation Phases

### Phase 1: Foundation & Auth ✅
- [x] Initialize Next.js, Tailwind, Lucide React.
- [x] Credentials Provider login against Team sheet.

### Phase 2: Core Data Services ✅
- [x] Sheets CRUD & Drive Storage automation.
- [x] LINE Notification & SWR Caching.

### Phase 3: Project & Team Management ✅
- [x] Dashboard, Project List, and Team Management.
- [x] Master Sheet registry for Projects, Team, and UserSites.
- [x] Admin-only Team menu and member edit flow.
- [x] Multi-step project creation wizard adapted from the older sample app.
- [x] Project Details page reads and displays Master Sheet project metadata.
- [x] Manual Google Sheet ID / Google Drive Folder ID entry during project creation.

### Phase 4: Operations Modules ✅
- [x] Daily Reports, Kanban Tasks, Issues/RFI, and Materials Tracking.
- [x] Site-aware API data resolution by `project_id`.
- [x] Site workspace shell and placeholder pages for upcoming modules.

### Phase 5: Deployment & Production ✅
- [x] Netlify deployment successful at **pmcconnext.netlify.app**.

### Phase 6: Advanced Construction Features (Next)
- [x] **Schedule Planner Upgrade**: Task order controls, H1/main tasks, subtasks, quick date edit mode, and print order alignment.
- [x] **Project Health Phase 1**: Projects list calculates schedule health from each site's Schedule tasks.
- [x] **Construction Schedule Phase 2 Start**: Tasks now support planned dates; Schedule Plan and Gantt share the same task data.
- [x] **Schedule Weight Removal**: Removed the visible Weight input so Phase 2 stays simple and planning-by-date focused.
- [x] **Planning Dashboard Summary**: Site dashboards summarize planning coverage, task count, milestone count, plan date range, next milestone, and open issue signals.
- [x] **H1 Parent Row Collapse**: H1 rows can expand/collapse child tasks, derive dates and planning coverage from children, and drive matching table/Gantt/print visibility.
- [x] **Spreadsheet Schedule Template UX**: Schedule Plan table supports table-level `+` creation, H1 full-width section bands, inline child-task creation, and outline numbering.
- [x] **Professional Schedule Print Polish**: Schedule/Gantt print outputs use consistent metadata, H1 section bands, child-task indentation, and dedicated Gantt print styling.
- [x] **Site Sheet Provisioning Foundation**: Create or attach a dedicated Google Sheet and Drive folder per site, then save the IDs back to Master.
- [x] **Sales CRM Project Handoff**: Sales Follow-up tabs, Master `Customers` sheet, unlimited contact history, lead edit/close flow, status filtering, deposited-lead project prefill, and professional print report.
- [x] **Data Architecture Direction**: Keep Google Sheets for the demo data layer, plan Supabase/Postgres for future production records, and keep Google Drive for files/photos/attachments.
- [ ] **Supabase Migration Planning**: Design Supabase schemas, RLS policies, migration scripts, and Drive file-reference tables for replacing Master/Site Sheets as the structured source of truth.
- [ ] **Phase 2 RFA/RFI/Issue Linking**: Link RFA/RFI/Issues/Defects to `task_id` or WBS category so the project dashboard can show schedule-impacting blockers.
- [ ] **Phase 2 Baseline Reporting**: Reintroduce planned vs actual variance only after the planning workflow is consistently used in the field.
- [ ] **Sales CRM Reminder/Owner Upgrade**: Lead owner assignment, next follow-up due date reminders, duplicate phone detection, and export support.
- [ ] **Payment Requests**: Professional payment request workflow with export/email support.
- [ ] **RFA**: Approval workflow for material/shop drawing/submittal requests.
- [ ] **RFI**: Question/answer workflow with status tracking and attachments.
- [ ] **Defect Management**: Floor-plan based defect tagging with client approval workflow.
- [ ] **VO System (Variation Orders)**: Approval workflow for work changes with PDF export and Drive backup.
- [ ] **Professional Branding**: Integration of "Pichayamongkol Construction Co., Ltd." logo and address on all exports.

## Branding
- **Company**: Pichayamongkol Construction Co., Ltd. (พิชยมงคล คอนสตรัคชั่น จำกัด)
- **Address**: 276/1 Soi Phuttha Bucha 36, Bang Mot, Thung Khru, Bangkok 10140.
- **Logo**: Integrated from `logo.png`.
