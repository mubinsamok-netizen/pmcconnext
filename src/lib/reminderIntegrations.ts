import { google } from "googleapis";
import { calendar, getDelegatedGoogleAuth } from "@/lib/google";
import { findAllMaster } from "@/lib/sheetsCrud";

type ReminderDispatchInput = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  message: string;
  link: string;
  dueDate: string;
};

type TeamRecord = Record<string, string | number | undefined>;

function normalizeEmail(email?: string | number | null) {
  return String(email || "").trim().toLowerCase();
}

function isEnabled(value?: string) {
  return String(value || "").toLowerCase() === "true";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildAbsoluteUrl(path: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "";
  if (!baseUrl || path.startsWith("http")) return path;
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getAdminEmails() {
  const team = await findAllMaster("Team") as TeamRecord[];
  return Array.from(new Set(
    team
      .filter((member) => (
        String(member.active || "TRUE") !== "FALSE" &&
        String(member.role || "").trim().toLowerCase() === "admin"
      ))
      .map((member) => normalizeEmail(member.email))
      .filter(Boolean)
  ));
}

export async function sendReminderEmail(input: ReminderDispatchInput, recipients: string[]) {
  if (!isEnabled(process.env.REMINDER_EMAIL_ENABLED) || recipients.length === 0) return { skipped: true };

  const delegatedAuth = getDelegatedGoogleAuth(["https://www.googleapis.com/auth/gmail.send"]);
  const sender = process.env.GMAIL_SENDER_EMAIL || process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || "";
  if (!delegatedAuth || !sender) {
    console.warn("Reminder email skipped: configure GOOGLE_WORKSPACE_ADMIN_EMAIL or GMAIL_SENDER_EMAIL with domain-wide delegation.");
    return { skipped: true };
  }

  const gmail = google.gmail({ version: "v1", auth: delegatedAuth });
  const body = [
    input.message,
    "",
    `โครงการ: ${input.projectName} (${input.projectId})`,
    `วันที่ครบกำหนด: ${input.dueDate}`,
    `เปิดในระบบ: ${buildAbsoluteUrl(input.link)}`,
  ].join("\n");
  const raw = [
    `From: ${sender}`,
    `To: ${recipients.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.title, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: toBase64Url(raw) },
  });

  return { skipped: false };
}

export async function createReminderCalendarEvent(input: ReminderDispatchInput, recipients: string[]) {
  if (!isEnabled(process.env.REMINDER_CALENDAR_ENABLED)) return { skipped: true };

  const delegatedAuth = getDelegatedGoogleAuth(["https://www.googleapis.com/auth/calendar"]);
  const calendarClient = delegatedAuth ? google.calendar({ version: "v3", auth: delegatedAuth }) : calendar;
  const calendarId = process.env.GOOGLE_REMINDER_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || "primary";
  const eventKey = `${input.id}@pcm-connext`;
  const nextDate = new Date(`${input.dueDate}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);

  await calendarClient.events.insert({
    calendarId,
    conferenceDataVersion: 0,
    requestBody: {
      id: eventKey.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 1024),
      summary: input.title,
      description: [
        input.message,
        "",
        `โครงการ: ${input.projectName} (${input.projectId})`,
        `เปิดในระบบ: ${buildAbsoluteUrl(input.link)}`,
      ].join("\n"),
      start: { date: input.dueDate },
      end: { date: nextDate.toISOString().slice(0, 10) },
      attendees: recipients.map((email) => ({ email })),
    },
  });

  return { skipped: false };
}

export async function dispatchReminderIntegrations(input: ReminderDispatchInput) {
  const recipients = await getAdminEmails();
  const results = await Promise.allSettled([
    sendReminderEmail(input, recipients),
    createReminderCalendarEvent(input, recipients),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("Reminder integration failed:", result.reason);
    }
  });
}
