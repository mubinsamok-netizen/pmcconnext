# PMC CONNEXT - AI Skill & Architecture Document

## 2026-05-03 Current Direction: Master Workspace + Site Sheets

> This section supersedes the older "1 Site = 1 Web App / Deployment" architecture notes below. Keep the older notes only as history unless the user explicitly asks to return to that model.

### Canonical Architecture
- Use one PCM CONNEXT web app deployment.
- Use `GOOGLE_MASTER_SHEET_ID` as the central Master Sheet.
- Master Sheet stores workspace-level data:
  - `Projects`: site/project registry, including `site_sheet_id`, `drive_folder_id`, project details, cover metadata, Sales CRM handoff fields, and team assignment fields.
  - `Team`: staff accounts, roles, contact info, and login data.
  - `UserSites`: mapping between user email and allowed `project_id`.
  - `Customers`: Sales CRM leads, contact history JSON, interest/status, deposit handoff state, and soft-close flag.
- Each site should have its own Google Sheet and Drive folder when available.
- Site modules must resolve `project_id` through `getProjectContext()` before reading or writing data.
- If `site_sheet_id` is blank, the app may fall back to legacy `GOOGLE_SHEET_ID` during development.

### Project Creation And Details
- `/dashboard/projects/new` is a 3-step project creation wizard adapted from the older sample app:
  - Step 1: project cover, project name, project type, project code, client, description.
  - Step 2: address, province, district, start/end dates, budget, contract number.
  - Step 3: map link, PM, SE, project status, `site_sheet_id`, `drive_folder_id`, Sales CRM/deposit status.
- Project creation must support manual `site_sheet_id` and `drive_folder_id`.
- If those IDs are blank, the API may create a Drive folder and site spreadsheet automatically, subject to Google quota.
- Project detail fields are stored in Master `Projects`, not in the site operation sheet.
- `/dashboard/sites/[projectId]/details` should read from Master `Projects` and display the saved project metadata.

### Sales CRM Follow-up And Handoff
- `/dashboard/sales-crm` is wired to Master `Customers` through `/api/sales-customers`.
- The page has two tabs: Lead entry form and Sales Follow-up table.
- Contact history is unlimited via `contact_logs_json`; do not model fixed Contact 1-4 columns.
- Use dropdowns for `interest_level` (`low`, `medium`, `high`) and `status` (`new`, `scheduled`, `waiting`, `deposited`, `not_interested`).
- Lead edits happen through a modal; close/archive uses `active = FALSE`, not hard delete.
- Deposited leads can open `/dashboard/projects/new` with query params to prefill client/description/address and set `sales_customer_id` plus `deposit_status`.
- Sales CRM has a professional print dialog/report. Preserve print-only behavior using `body.printing-sales-crm` and `.sales-crm-print-document`.
- A lead/customer should become a construction project only after deposit is paid. Admin may still create manual projects using `deposit_status = manual`.
- Keep Sales CRM follow-up data in Master `Customers`; do not write CRM follow-up logs into site sheets.

### Workspace / Master Navigation
- Workspace-level sidebar should contain:
  - Dashboard รวม
  - ไซต์งาน
  - Sales CRM
  - จัดการพนักงาน
- `จัดการพนักงาน` is Admin-only.
- Team management must support add/edit staff and assign allowed site access.
- Current edit route: `/dashboard/team/[memberId]/edit`.

### Site Navigation
When the user opens a site, the sidebar changes to site mode:
- ภาพรวมของโครงการ
- รายละเอียดโครงการ
- รายงานประจำวัน
- แผนงาน
- ระบบเบิกเงิน
- RFA
- RFI
- Defect
- รูปภาพและไฟล์ทั้งหมด

### Schedule Planner Rules
- Tasks support order controls, H1/main task structure, subtasks, quick date edit mode, and print output in the same order shown on screen.
- Print behavior must stay aligned with the current visible task order.
- Phase 2 schedule data is cost-free and construction-operations focused.
- Phase 2 is planning-only for now: users should be able to enter the plan, see it in the Gantt chart, and review a planning summary on the site dashboard.
- Do not show or require actual start/end dates until the user explicitly reintroduces plan-vs-actual tracking.
- Site `Tasks` support planning fields: `planned_start` and `planned_end`.
- Do not expose `Weight` in the Schedule UI unless the user explicitly reintroduces weighted progress later.
- Treat `start/end` as the current Gantt-compatible planned dates; keep them synchronized with `planned_start/planned_end` when editing from the Schedule UI.
- Project list health should show plan completeness for now: non-heading tasks with planned start/end dates divided by total non-heading tasks.
- H1 heading tasks are organizational rows and should not be counted as work tasks in project planning metrics.
- H1 rows should behave as parent summary rows: they expand/collapse child tasks, derive start/end from child task date ranges, and derive their planning percentage from child task date coverage.
- Schedule Plan should feel like a spreadsheet planning template: H1 rows are full-width section bands, child tasks use outline numbering under the H1, and users can create main/child tasks directly from table-level `+` actions.
- Every H1 row should provide an inline add-child action that opens the task form with that H1 preselected as parent.
- Table, Gantt Chart, and print output must use the same visible task rows. If a user collapses an H1, print and Gantt should show only that H1 summary; if expanded, show both H1 and children.
- Print outputs should look like professional construction documents: include company header, project metadata, compact summary cards, H1 section bands, indented child tasks, and signature blocks.
- Gantt labels should visually indent child tasks under H1 rows while keeping timeline bars aligned to real dates.
- Persist H1 expand/collapse state per project in local storage.
- Keep H1 + one child level only unless the user explicitly asks for H2/H3 later.
- Site dashboards should summarize planning coverage, total planned tasks, milestone count, plan date range, next milestone, open issues, and high-priority items.
- Cost, BOQ, budget, and payment logic must stay out of Phase 2 schedule progress unless the user explicitly reintroduces cost later.
- Future Phase 2 work should link RFA/RFI/Issues/Defects to `task_id` or WBS category, then show schedule-impacting blockers in Project Overview/Health.

### Implementation Guardrails
- Do not build new site modules directly against only the global `GOOGLE_SHEET_ID`.
- For site data APIs, resolve the target site first and then use the returned sheet/folder IDs.
- Keep Master data in Master Sheet and site operation data in the site sheet.
- If Drive quota blocks automatic site sheet creation, allow manual `site_sheet_id` / `drive_folder_id` updates in Master.

---

เอกสารนี้คือ "สมอง" และ "คู่มือ" ของโปรเจกต์ PMC CONNEXT สำหรับ AI ทุกตัวที่เข้ามาทำงานต่อ ต้องอ่านและทำความเข้าใจบริบท สถาปัตยกรรม และมาตรฐานของระบบนี้ให้ละเอียดก่อนเริ่มเขียนโค้ด

---

## 🏗️ 1. สถาปัตยกรรมระบบ (System Architecture)

### 1.1 แนวคิด "1 Site = 1 System" (แยกไซต์เด็ดขาด)
*   เพื่อความเร็วสูงสุดและแยกข้อมูล (Data Isolation) จะใช้สถาปัตยกรรม **1 ไซต์งาน = 1 Web App (1 Deployment)**
*   แต่ละไซต์งานจะมี `GOOGLE_SHEET_ID` และ `GOOGLE_DRIVE_FOLDER_ID` ของตัวเอง ระบุในไฟล์ `.env.local`
*   **การเข้าสู่ระบบ**: ใช้ Email/Password ตรวจสอบกับแท็บ `Team` ใน Google Sheet ของไซต์นั้นๆ

### 1.2 Tech Stack
*   **Frontend & API**: Next.js 16 (App Router), React 19
*   **Database**: Google Sheets (ผ่าน Google Sheets API v4) - *ห้ามใช้ Database อื่น*
*   **Storage**: Google Drive (ผ่าน Google Drive API v3)
*   **Styling**: Tailwind CSS, ฟอนต์ Kanit (ภาษาไทย)
*   **Performance**: ใช้ SWR (Client-side Caching) เพื่อให้โหลดหน้าเว็บได้ทันที (0 วินาที)
*   **Deployment**: Netlify (`--webpack` flag)

---

## 🏢 2. ข้อมูลองค์กรและ Branding (Corporate Identity)

ทุกเอกสารที่สร้างจากระบบ (HTML Print/PDF) ต้องมีหัวเอกสารที่เป็นทางการและสวยงาม โดยอ้างอิงข้อมูลนี้:
*   **ชื่อบริษัท**: บริษัท พิชยมงคล คอนสตรัคชั่น จำกัด (Pichayamongkol Construction Co.,Ltd.)
*   **ที่อยู่**: 276/1 ซอยพุทธบูชา 36 แขวงบางมด บางมด เขตทุ่งครุ กรุงเทพมหานคร 10140
*   **โลโก้**: ใช้ไฟล์จาก `public/logo.png`
*   **รูปแบบรหัสเอกสาร**: อิงตามที่ตั้งค่าในโปรเจกต์ (เช่น `PMC-DR-001`)

**ข้อมูลที่ต้องกรอกเมื่อสร้างไซต์ใหม่ (ลงใน Google Sheet):**
1. ชื่อโครงการ
2. ชื่อลูกค้า
3. ที่ตั้งไซต์
4. วันเริ่ม - วันสิ้นสุด
5. เบอร์โทรลูกค้า
6. รหัสเอกสาร (Prefix)

---

## 👥 3. สิทธิ์การใช้งาน (Role-Based Access Control)

ระบบรองรับผู้ใช้งาน 4-5 คนต่อไซต์ โดยแบ่งสิทธิ์ดังนี้:
1.  **Admin / เจ้าของบริษัท**: เห็นและทำได้ทุกอย่าง (เพิ่ม/ลบ/แก้ไข)
2.  **Project Manager (PM)**: ทำได้ทุกอย่างเหมือน Admin แต่ **ลบข้อมูลไม่ได้**
3.  **Foreman / Engineer**: กรอกข้อมูลหน้างาน (Daily Report, Issues, Materials, ขอเบิก, ขอ VO)
4.  **Client (ลูกค้า)**: เข้ามาดูได้อย่างเดียว (Dashboard, แผนงาน, VO) และ **มีสิทธิ์กดยืนยัน/อนุมัติ Defect**

---

## 🚀 4. ฟีเจอร์หลักและการทำงาน (Core Features)

### 4.1 หน้า Dashboard (ภาพรวมโครงการ)
ต้องแสดงข้อมูลสรุปจากทุกโมดูลให้ดูง่ายและจบในหน้าเดียว:
*   **แผนงาน (Schedule)**: แสดง % ความคืบหน้ารวม และตารางสรุปงานที่ทำอยู่/ล่าช้า
*   **VO (งานเพิ่ม-ลด)**: สรุปจำนวนและสถานะ (เช่น รออนุมัติ 2, อนุมัติแล้ว 5)
*   **RFI / RFA**: สรุปรายการคำถาม (RFI) และคำขออนุมัติวัสดุ/แบบ (RFA)
*   **Daily Report**: รายงานล่าสุด และสรุปจำนวนรายงานของเดือน
*   **Defect**: สรุปรายการข้อบกพร่องจากลูกค้า และสถานะการแก้ไข

### 4.2 แผนงาน (Gantt Chart & Milestone)
*   สร้าง Gantt Chart จากข้อมูลวันเริ่ม-สิ้นสุดในตาราง Tasks
*   **Milestone เบิกงวด**: สามารถกำหนด Milestone เป็น "งวดงาน" ได้ (จำนวนงวดกำหนดเองได้อิสระ) ไม่ต้องระบุ % หรือจำนวนเงิน แต่ใช้เป็นจุดอ้างอิงร่วมกันในทีม
*   สามารถกด Print Dialog แผนงานและ Milestone ออกมาเป็นเอกสารได้

### 4.3 งานเพิ่ม-ลด (VO - Variation Order)
*   วิศวกรสร้าง VO -> รอ PM/เจ้าของอนุมัติ
*   เมื่ออนุมัติแล้ว ระบบจะสร้าง **HTML Document** ที่สวยงาม มีโลโก้บริษัท และช่องลายเซ็น เพื่อ Print หรือ Save เป็น PDF ให้ลูกค้าเซ็น
*   บันทึกไฟล์ VO ลงใน Google Drive ของไซต์นั้นอัตโนมัติ

### 4.4 การทำเบิกเงิน (Payment Request)
*   วิศวกรกรอกฟอร์มขอเบิกเงิน
*   ระบบสร้าง "ใบเบิก" หน้าตาเป็นทางการ
*   **Gmail Integration**: มีช่องให้กรอก Email ปลายทาง และระบบสามารถกดปุ่ม **"ส่งเข้า Gmail"** ได้ทันทีจากหน้าเว็บ

### 4.5 ระบบ Defect (รองรับลูกค้า)
*   ระบบสำหรับตรวจรับงาน (ต่างจาก Issues ที่ใช้ภายใน)
*   **อัปโหลดรูป**: ต้องแนบรูปแปลน (Floor Plan) และรูปจุดที่มีปัญหา (ก่อน-หลังแก้ไข) ได้
*   **การอนุมัติ**: ลูกค้าต้องเข้ามาในระบบเพื่อกด "ยืนยัน/อนุมัติ" ว่าแก้ไข Defect นั้นแล้ว หากยังไม่อนุมัติจะถือว่างานไม่จบ

### 4.6 RFI & RFA
*   **RFI (Request for Information)**: สำหรับสอบถามข้อสงสัยเรื่องแบบหรือสเปค
*   **RFA (Request for Approval)**: สำหรับขออนุมัติวัสดุ พร้อมระบบแนบไฟล์รูปภาพหรือ Drawing

---

## 🔔 5. ระบบแจ้งเตือน (LINE Flex Message)

ใช้ LINE Messaging API (Flex Message) เพื่อความสวยงาม โดยมีเงื่อนไขการแจ้งเตือนดังนี้:
*   **กลุ่มเป้าหมาย**: มี LINE Group รวมของทีมงาน และ/หรือ กลุ่มที่มีลูกค้าอยู่ด้วย

| เหตุการณ์ | ส่งแจ้งเตือนไปที่ |
| :--- | :--- |
| 📋 มีรายงานประจำวันใหม่ (Daily Report) | กลุ่ม LINE ของไซต์ (ที่มีลูกค้า) |
| 🚨 มีปัญหาหน้างาน (Issue) ระดับ High/Urgent | กลุ่ม LINE ทีมงาน + แจ้ง PM โดยตรง |
| 💰 มีการสร้างฟอร์มขอเบิกเงิน | แจ้ง PM + Admin |
| 📝 งานเพิ่ม-ลด (VO) ถูกสร้าง / อนุมัติ | กลุ่ม LINE ของไซต์ (ให้ลูกค้ารับทราบ) |

---

## 🤖 6. กฎเหล็กสำหรับ AI (AI Developer Guidelines)

1.  **UX/UI First**: ใช้สีส้ม/เทา/ขาว เป็นหลัก ทำให้ดู Premium, สบายตา และเป็นมืออาชีพ รูปแบบเอกสาร Print ต้องเป๊ะ
2.  **SWR Always**: ทุกหน้าที่ดึงข้อมูลจาก Sheets ต้องใช้ `useSWR` เพื่อทำ Caching ห้ามดึงข้อมูลฝั่ง Server บน Client Component โดยตรง
3.  **Drive Uploads**: รูปภาพและไฟล์ทั้งหมดต้องบีบอัดฝั่ง Client ก่อนส่งผ่าน API Route ไปเก็บที่ Google Drive (ไม่เก็บ Base64 ลง Sheet เด็ดขาด)
4.  **No New Databases**: ห้ามเสนอให้ใช้ Firebase, Supabase, Postgres ฯลฯ เด็ดขาด ข้อมูล Text อยู่ใน Sheets, รูปภาพอยู่ใน Drive เท่านั้น
