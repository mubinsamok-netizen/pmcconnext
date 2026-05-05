import { insertMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";

type AuditActor = {
  email?: string | null;
  name?: string | null;
  role?: string | null;
  googleSub?: string | null;
};

type AuditLogInput = {
  actor?: AuditActor | null;
  projectId?: string;
  module: string;
  action: string;
  targetId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

function toJson(value: unknown) {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export async function writeAuditLog(input: AuditLogInput) {
  await ensureMasterSchema();

  const timestamp = new Date().toISOString();
  await insertMaster("AuditLogs", {
    log_id: `LOG-${Date.now()}`,
    timestamp,
    actor_email: input.actor?.email || "",
    actor_name: input.actor?.name || "",
    actor_role: input.actor?.role || "",
    actor_google_sub: input.actor?.googleSub || "",
    project_id: input.projectId || "",
    module: input.module,
    action: input.action,
    target_id: input.targetId || "",
    summary: input.summary || "",
    before_json: toJson(input.before),
    after_json: toJson(input.after),
  });
}
