import { BarChart3, Bug, CalendarDays, CheckCircle2, ClipboardList, FileSignature, Flag, FolderOpen, Image as ImageIcon, NotebookTabs, ReceiptText, Sheet, Sparkles, StickyNote, TrendingUp } from "lucide-react";
import type { MasterProject } from "@/lib/masterProjects";
import SiteCalendarPanel from "./SiteCalendarPanel";
import { buildDriveFolderUrl, formatDate, formatMoney, isForemanVisibleHref, toDateInputValue, type DashboardData } from "./overviewData";
import { Panel, ActionRow, RecentRow, EmptyState, SmallMetric, InfoStrip, QuickLink, ExternalQuickLink, ResourceRow } from "./OverviewUi";

export default async function OverviewSecondary({ project, data, isForeman }: { project: MasterProject; data: Promise<DashboardData>; isForeman: boolean }) {
  const dashboard = await data;
  const visibleActions = isForeman ? dashboard.actions.filter((action) => isForemanVisibleHref(action.href)) : dashboard.actions;
  const visibleRecent = isForeman ? dashboard.recent.filter((item) => isForemanVisibleHref(item.href)) : dashboard.recent;
  const visibleCalendarEvents = isForeman ? dashboard.calendarEvents.filter((event) => isForemanVisibleHref(event.href)) : dashboard.calendarEvents;
  const driveFolderUrl = buildDriveFolderUrl(project.drive_folder_id);
  const actionItems = visibleActions.length ? visibleActions : [{ title: "ไม่มีรายการเร่งด่วน", detail: "ตรวจแผนงาน รายงาน และบันทึกหน้างานได้จากทางลัดด้านล่าง", href: `/dashboard/sites/${project.project_id}/schedule`, icon: CheckCircle2, tone: "green" as const }];
  return <>
      <SiteCalendarPanel events={visibleCalendarEvents} projectId={project.project_id} initialDate={toDateInputValue(new Date().toISOString())} />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="สิ่งที่ควรทำตอนนี้" icon={Sparkles} href={`/dashboard/sites/${project.project_id}/schedule`} actionLabel="เปิดแผนงาน">
          <div className="space-y-3">
            {actionItems.map((action) => (
              <ActionRow key={`${action.title}-${action.href}`} action={action} />
            ))}
          </div>
        </Panel>

        <Panel title="กิจกรรมล่าสุด" icon={TrendingUp} href={`/dashboard/sites/${project.project_id}/notes`} actionLabel="เปิดบันทึก">
          {visibleRecent.length > 0 ? (
            <div className="space-y-3">
              {visibleRecent.map((item) => (
                <RecentRow key={`${item.title}-${item.href}`} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState text="ยังไม่มี activity ล่าสุดจากรายงาน บันทึก ไฟล์ หรือเอกสารของไซต์นี้" />
          )}
        </Panel>
      </div>

      <div className={`grid gap-4 ${isForeman ? "xl:grid-cols-2" : "xl:grid-cols-3"}`}>
        <Panel title="แผนงานและ Milestone" icon={BarChart3} href={`/dashboard/sites/${project.project_id}/schedule?tab=gantt`} actionLabel="Gantt">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="งานทั้งหมด" value={String(dashboard.planning.workTaskCount)} />
            <SmallMetric label="เสร็จแล้ว" value={String(dashboard.planning.completedTaskCount)} />
            <SmallMetric label="Milestone" value={String(dashboard.planning.milestoneCount)} />
            <SmallMetric label="Priority สูง" value={String(dashboard.planning.highPriorityItems)} tone={dashboard.planning.highPriorityItems ? "red" : "green"} />
          </div>
          <InfoStrip
            icon={CalendarDays}
            label="ช่วงแผนงาน"
            value={dashboard.planning.planStart && dashboard.planning.planEnd ? `${formatDate(dashboard.planning.planStart)} - ${formatDate(dashboard.planning.planEnd)}` : "ยังไม่ได้กรอกช่วงแผนงาน"}
          />
          <InfoStrip icon={Flag} label="Milestone ถัดไป" value={dashboard.planning.nextMilestone || "ยังไม่มี Milestone ถัดไป"} />
        </Panel>

        {!isForeman && (
          <Panel title="คุณภาพงานและส่งมอบ" icon={Bug} href={`/dashboard/sites/${project.project_id}/defects`} actionLabel="Defect">
            <div className="grid grid-cols-2 gap-3">
              <SmallMetric label="รอบตรวจ" value={String(dashboard.defects.roundCount)} />
              <SmallMetric label="ลูกค้ารับทราบ" value={`${dashboard.defects.acknowledgedRounds}/${dashboard.defects.roundCount}`} tone="green" />
              <SmallMetric label="รอแก้" value={String(dashboard.defects.openItems)} tone={dashboard.defects.openItems ? "red" : "green"} />
              <SmallMetric label="แก้/ปิดแล้ว" value={String(dashboard.defects.fixedItems + dashboard.defects.passedItems)} />
            </div>
            <InfoStrip icon={CheckCircle2} label="รอบล่าสุด" value={dashboard.defects.latestRound || "ยังไม่มีรอบตรวจส่งมอบ"} />
          </Panel>
        )}

        {!isForeman && (
          <Panel title="การเงินและเอกสารอนุมัติ" icon={ReceiptText} href={`/dashboard/sites/${project.project_id}/variation-orders`} actionLabel="VO">
            <div className="grid grid-cols-2 gap-3">
              <SmallMetric label="VO ทั้งหมด" value={String(dashboard.commercial.voCount)} />
              <SmallMetric label="VO เปิดอยู่" value={String(dashboard.commercial.openVoCount)} tone={dashboard.commercial.openVoCount ? "orange" : "green"} />
              <SmallMetric label="มูลค่า VO" value={formatMoney(dashboard.commercial.voAmount)} suffix="บาท" />
            </div>
          </Panel>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="บันทึกข้อความ / Memo" icon={FileSignature} href={`/dashboard/sites/${project.project_id}/memos`} actionLabel="เปิด Memo">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="Memo ทั้งหมด" value={String(dashboard.memos.totalCount)} />
            <SmallMetric label="รอรับทราบ" value={String(dashboard.memos.waitingAckCount)} tone={dashboard.memos.waitingAckCount ? "orange" : "green"} />
            <SmallMetric label="รับทราบแล้ว" value={String(dashboard.memos.acknowledgedCount)} tone="green" />
            <SmallMetric label="มีผลต่อเวลา" value={String(dashboard.memos.timeImpactCount)} tone={dashboard.memos.timeImpactCount ? "orange" : "green"} />
          </div>
          <InfoStrip icon={CalendarDays} label="วันที่ขอเพิ่ม" value={`${dashboard.memos.extensionDays} วัน / อนุมัติแล้ว ${dashboard.memos.approvedExtensionDays} วัน`} />
          <InfoStrip icon={FileSignature} label="Memo ล่าสุด" value={dashboard.memos.latestTitle || "ยังไม่มีบันทึกข้อความ"} />
        </Panel>

        <Panel title="บันทึกหน้างาน" icon={NotebookTabs} href={`/dashboard/sites/${project.project_id}/notes`} actionLabel="เปิด Notes">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="บันทึกใช้งาน" value={String(dashboard.notes.activeCount)} />
            <SmallMetric label="ปักหมุด" value={String(dashboard.notes.pinnedCount)} />
            <SmallMetric label="ด่วน" value={String(dashboard.notes.urgentCount)} tone={dashboard.notes.urgentCount ? "red" : "green"} />
            <SmallMetric label="ต้องติดตาม" value={String(dashboard.notes.followUpDue)} tone={dashboard.notes.followUpDue ? "orange" : "green"} />
          </div>
          <InfoStrip icon={StickyNote} label="ล่าสุด" value={dashboard.notes.latestTitle || "ยังไม่มีบันทึกหน้างาน"} />
        </Panel>

        <Panel title="ไฟล์และรายงาน" icon={FolderOpen} href={`/dashboard/sites/${project.project_id}/files`} actionLabel="เปิดไฟล์">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SmallMetric label="ไฟล์ทั้งหมด" value={String(dashboard.files.totalCount)} />
            <SmallMetric label="รูปภาพ" value={String(dashboard.files.imageCount)} />
            <SmallMetric label="เอกสาร" value={String(dashboard.files.documentCount)} />
            <SmallMetric label="รายงานรวม" value={String(dashboard.reports.dailyCount + dashboard.reports.weeklyCount + dashboard.reports.monthlyCount)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoStrip icon={ImageIcon} label="ไฟล์ล่าสุด" value={dashboard.files.latestTitle || "ยังไม่มีไฟล์ในไซต์"} />
            <InfoStrip icon={ClipboardList} label="Daily report ล่าสุด" value={dashboard.reports.latestDailyTitle || "ยังไม่มีรายงานประจำวัน"} />
          </div>
        </Panel>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-gray-950">ทางลัดและแหล่งข้อมูลไซต์</h3>
            <p className="text-sm font-semibold text-gray-500">เก็บลิงก์ที่ใช้บ่อยไว้ท้ายหน้า ไม่ให้รบกวน dashboard หลัก</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickLink href={`/dashboard/sites/${project.project_id}/reports`} label="รายงาน" icon={ClipboardList} />
            <QuickLink href={`/dashboard/sites/${project.project_id}/files`} label="ไฟล์" icon={FolderOpen} />
            <QuickLink href={`/dashboard/sites/${project.project_id}/notes`} label="บันทึก" icon={NotebookTabs} />
            <QuickLink href={`/dashboard/sites/${project.project_id}/memos`} label="Memo" icon={FileSignature} />
            {driveFolderUrl ? <ExternalQuickLink href={driveFolderUrl} label="อัปโหลดไฟล์ใหญ่ใน Drive" icon={FolderOpen} /> : null}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ResourceRow icon={Sheet} label="Site Google Sheet" value={project.site_sheet_id || "ยังไม่ได้กำหนด"} />
          <ResourceRow
            icon={FolderOpen}
            label="Site Drive Folder"
            value={project.drive_folder_id || "ยังไม่ได้กำหนด"}
            actionHref={driveFolderUrl}
            actionLabel="เปิดโฟลเดอร์เพื่ออัปโหลด"
          />
        </div>
      </section>
  </>;
}
