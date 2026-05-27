# Development Log

## 2026-05-05 - Data Architecture Direction

### Session 14: Demo Sheets Now, Supabase Later
- **Accomplished**:
    - Documented the near-term demo strategy: keep using Google Sheets as the working data layer so the team can demo and validate workflows quickly.
    - Documented the future production direction: migrate core structured data to Supabase/Postgres when the workflow stabilizes and concurrency becomes more important.
    - Kept Google Drive as the long-term home for files, photos, attachments, generated PDFs, and project folders.

### Notes
- Google Sheets is treated as a demo/prototyping data source, not the final production database.
- Future Supabase tables should become the source of truth for searchable/editable records, while rows can continue to store Google Drive file and folder IDs for attachments.
- This keeps the team's familiar Drive-based file workflow while reducing reliability issues from using Sheets/Drive as the full application database under multi-user load.

## 2026-05-03 - Remove Schedule Weight Field

### Session 13: Planning Form Simplification
- **Accomplished**:
    - Removed the visible `Weight` field from the Schedule task form.
    - Stopped sending `weight` from `/api/tasks`; new tasks now rely on planned dates and duration for planning summaries.
    - Kept duration-based planning calculations so existing progress/summary displays continue to work without a separate weight input.

### Notes
- The legacy `weight` sheet column is left in the schema for backward compatibility with existing site sheets, but it is no longer part of the user workflow.

## 2026-05-03 - Professional Schedule Print Polish

### Session 12: Print Layout + Gantt Hierarchy
- **Accomplished**:
    - Improved Schedule Plan print output with professional summary cards for print date, H1 count, visible child task count, and planning completeness.
    - Updated printed plan tables so H1 rows render as full-width dark section bands and child tasks are indented.
    - Added a dedicated `gantt-print-doc` class so Gantt-specific print CSS applies correctly.
    - Improved Gantt readability by indenting child task labels under H1 rows.
    - Kept print output aligned with the current visible expand/collapse state.

### Notes
- The Gantt timeline bars still preserve true date alignment; only the task label area is indented for hierarchy readability.

## 2026-05-03 - Spreadsheet Schedule Template UX

### Session 11: Table-First Task Entry
- **Accomplished**:
    - Shifted the Schedule Plan table closer to a spreadsheet-style planning template.
    - Added table-level `+` actions for creating a main H1 row or a child task directly from the table.
    - Converted H1 rows into full-width dark section bands so they read like major work groups in a construction schedule.
    - Added an inline `+ งานย่อย` action on every H1 row that opens the task form with that H1 preselected as the parent.
    - Added outline numbering for visible rows, so H1 rows display as `1`, `2`, and child tasks display as `1.1`, `1.2`, etc.

### Notes
- The table remains connected to the same Gantt and print visibility logic from Session 10.
- This keeps planning fast while preserving the structured H1 + child task model.

## 2026-05-03 - H1 Collapse + Gantt Visibility

### Session 10: Parent Schedule Rows
- **Accomplished**:
    - Added collapsible H1 rows in the Schedule Planner with a triangle toggle in front of each main heading.
    - H1 start/end dates now derive from the earliest and latest dates of its child tasks.
    - H1 planning percentage now derives from child task date coverage, so an H1 with 3 of 4 children dated shows 75%.
    - Child tasks are displayed directly under their H1 regardless of global task order, preventing tasks from visually mixing under the wrong heading.
    - Gantt Chart now follows the same visible row state as the plan table: collapsed H1 shows only the H1 summary bar, expanded H1 shows both H1 and child task bars.
    - Print output now follows the current expand/collapse state exactly for both plan table and Gantt Chart.
    - Expand/collapse state is saved per project in local storage so users keep their preferred view after refresh.

### Notes
- H1 rows without child tasks show blank dates and no artificial Gantt bar.
- Phase 2 remains planning-only; actual-vs-plan tracking is still deferred.

## 2026-05-03 - Planning-Only Phase 2 Adjustment

### Session 9: Schedule Planning + Project Dashboard Summary
- **Accomplished**:
    - Removed actual start/end date inputs from the Schedule Planner so Phase 2 focuses on planning only.
    - Kept task planning fields (`planned_start`, `planned_end`) synchronized with legacy `start/end` so the Gantt chart continues to render from the same task data.
    - Changed project list health from actual-style progress to plan completeness: tasks with planned start/end dates divided by total non-heading tasks.
    - Added direct links from the site dashboard to the Schedule Plan and Gantt Chart views.
    - Added a planning summary to each site dashboard with task count, planned-date coverage, milestone count, plan date range, next milestone, open issues, and high-priority items.
    - Added a dashboard surface for future RFA/RFI/Issue linkage without forcing actual tracking yet.

### Notes
- Phase 2 is now intentionally planning-first: users can enter the construction plan, review it as a Gantt chart, and see the planning summary on the project dashboard.
- Actual-vs-plan controls are deferred until the workflow has enough field usage to make variance reporting meaningful.
- Cost remains excluded from this schedule phase.

## 2026-05-03 - Construction Schedule Phase 2

### Session 8: Planned Date Foundation
- **Accomplished**:
    - Started Phase 2 for construction operations without introducing cost tracking.
    - Extended the site `Tasks` planning model with `planned_start` and `planned_end`.
    - Updated `/api/tasks` so new schedule tasks persist planned dates while keeping legacy `start/end` compatibility for the Gantt view.
    - Updated `/dashboard/schedule` task forms to capture planned date range.

### Notes
- Phase 2 now has the core data structure needed for professional WBS planning.
- Existing projects and tasks remain compatible because new planning columns are appended to the end of the `Tasks` schema.
- Cost remains intentionally excluded; future cost modules can attach to the planning structure later if needed.

## 2026-05-03 - Project Health & Site Card UX

### Session 7: Task-Based Project Progress
- **Accomplished**:
    - Changed project list progress from manual-only `percent_done` to task-based project health when site tasks exist.
    - Added duration-based project progress from `Tasks.percent_done` and `duration_days` / task date range.
    - Added project card health metrics: completed tasks, total tasks, overdue task count, and maximum delay days.
    - Redesigned project cards into horizontal dashboard rows for better scanning and space efficiency.
    - Removed Site Sheet / Drive Folder status rows from project cards and replaced them with start/end dates.

### Notes
- `/api/projects` now enriches Master `Projects` with computed health data from each site's Tasks sheet.
- If a site has no tasks or no site sheet, project progress falls back to the manual value for backward compatibility.

## 2026-05-03 - Sales CRM Follow-up Workflow

### Session 6: Sales CRM Tabs, Lead Management & Print Preview
- **Accomplished**:
    - Rebuilt `/dashboard/sales-crm` from a placeholder into a usable Sales CRM workflow based on the Sales department DOCX proposal.
    - Added the Master `Customers` sheet schema for Sales CRM leads.
    - Added `/api/sales-customers` for listing, creating, updating, adding contact logs, marking deposited, and closing leads without deleting the Master Sheet row.
    - Split Sales CRM into two tabs:
        - `Lead Form`: input area for new customer/lead details.
        - `Sales Follow-up Table`: searchable and filterable follow-up table.
    - Implemented unlimited contact history via `contact_logs_json`; the table shows recent history and total contact count instead of fixed "Contact 1-4" columns.
    - Added dropdowns with color states for interest level and lead status.
    - Added Lead edit modal for name, nickname, phone, LINE ID, requirements, notes, freebies, interest, and status.
    - Added soft-close/archive behavior for leads by setting `active = FALSE`.
    - Added status filtering for Sales Follow-up.
    - Added professional HTML print preview dialog for Sales Follow-up with company logo, report metrics, table output, and print-only CSS.
    - Preserved handoff flow: deposited leads can be sent to `/dashboard/projects/new` with customer and sales metadata prefilled.

### Notes
- Sales CRM now supports the first real working version of the sales-to-project pipeline.
- The Master `Customers` sheet is now the source of truth for Sales follow-up, while created construction projects remain in Master `Projects` and site sheets.
- Future enhancements can include appointment reminders, lead owner assignment, duplicate phone detection, and export to Excel/PDF.

## 2026-05-03 - Project Creation Wizard & Site Details

### Session 5: Sales-to-Project Handoff Foundation
- **Accomplished**:
    - Adapted the older sample project's multi-step "Create New Construction Project" flow into the current Next.js app.
    - Rebuilt `/dashboard/projects/new` as a 3-step wizard: project information, location/planning, and team/data system.
    - Added project detail fields to the Master `Projects` schema: project type, description, address, province, district, contract number, map link, PM, SE, cover metadata, sales stage, and deposit status.
    - Added inputs for `site_sheet_id` and `drive_folder_id` during project creation.
    - Updated `/api/projects` to accept JSON or multipart form data, use manually supplied Google Sheet/Drive IDs when provided, or provision new site storage when blank.
    - Added optional project cover upload to the project Drive folder.
    - Built the site Project Details page to display the stored project metadata from Master Sheet.
    - Updated project cards to use cover/location/team metadata when available.
    - Added a Sales CRM handoff note: real projects should originate from leads that have paid a deposit, then create the site registry entry in Master Sheet.

### Notes
- Sales CRM is now wired through the Master `Customers` sheet and can hand off deposited leads into the project creation wizard.
- If Drive quota blocks automatic provisioning, users can manually paste existing Google Sheet and Drive folder IDs during project creation.

## 2026-05-03 - Master Workspace, Site Context & Team Editing

### Session 4: Master Sheet Registry + Site Workspace Shell
- **Accomplished**:
    - Configured the new Master Sheet through `GOOGLE_MASTER_SHEET_ID` for workspace-level data.
    - Moved workspace registries to Master tabs: `Projects`, `Team`, and `UserSites`.
    - Added Master/Site data separation: site modules now resolve `project_id` to the site's `site_sheet_id` and `drive_folder_id`, with legacy sheet fallback while a site sheet is not created yet.
    - Split navigation into Workspace/Master mode and Site mode.
    - Workspace sidebar now includes Dashboard, Sites, Sales CRM placeholder, and Team management for Admin users only.
    - Site sidebar now includes Project Overview, Project Details, Daily Reports, Schedule, RFA, RFI, Defect, and Files.
    - Added placeholder pages for the new Site modules so the user can enter a site and see the intended structure.
    - Added Team edit actions and `/dashboard/team/[memberId]/edit` so Admin can update member details, role, and allowed site access.
    - Enhanced the Schedule planner with task ordering controls, H1/main-task structure, subtasks, quick date edit mode, and print order alignment.

- **Migration / Setup Notes**:
    - `/api/setup` now ensures both Master schema and site schema.
    - Existing legacy `Projects` and `Team` rows were migrated into the Master Sheet.
    - Automatic site Sheet creation can be skipped when Google Drive quota is exceeded; manual `site_sheet_id` entry in Master remains supported.

## 2026-05-02 - Production Deployment & Final Phase 4 Completion

### Session 3: Architecture Planning & Next Phase Design
- **Accomplished**:
    - Finalized Netlify Deployment and fixed all production build issues (TypeScript, AuthOptions, Webpack for Thai folder names).
    - Discussed and documented the "1 Site = 1 System" architecture strategy.
    - Designed the advanced features for Phase 6: Gantt Charts with Milestones, VO (Variation Order) with PDF generation, and Client-facing Defect management with floor plans.
    - Collected full company branding details: Pichayamongkol Construction Co., Ltd.

## 2026-05-02 - Phase 4: Operations Modules & UX Optimization

### Session 2: Materials, Issues & Kanban
- **Accomplished**:
    - **UX Optimization**: Implemented SWR caching for instant page loads.
    - **Sidebar Upgrade**: Created a collapsible, branded sidebar with logo support.
    - **Task Tracker**: Built a drag-and-drop Kanban board for project tasks.
    - **Issues Module**: Created a full tracking system for site problems and RFI.
    - **Budget & Materials**: Built a cost tracking module with project-specific filtering.
    - **Netlify Deploy**: Successfully deployed the application to production.

## 2026-05-02 - Next.js Setup & Data Layer Foundation

### Session 1: Project Bootstrap
- **Accomplished**:
    - Initialized Next.js project with Tailwind CSS.
    - Configured NextAuth for role-based login via Google Sheets (Team tab).
    - Built the Core Data Layer (Sheets CRUD & Drive storage automation).
    - Implemented LINE Notification system for Daily Reports.
    - Created Project and Team management modules.
