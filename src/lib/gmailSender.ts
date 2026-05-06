import { google } from "googleapis";
import { getDelegatedGoogleAuth } from "@/lib/google";

export type GmailAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export type SendGmailInput = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  attachments?: GmailAttachment[];
};

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(sanitizeHeader(value), "utf8").toString("base64")}?=`;
}

function encodeAddressList(values: string[]) {
  return values.map(sanitizeHeader).filter(Boolean).join(", ");
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildMimeMessage(input: SendGmailInput, sender: string) {
  const attachments = input.attachments || [];
  const headers = [
    `From: ${sanitizeHeader(sender)}`,
    `To: ${encodeAddressList(input.to)}`,
    input.cc?.length ? `Cc: ${encodeAddressList(input.cc)}` : "",
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  if (attachments.length === 0) {
    return [
      ...headers,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(input.text, "utf8").toString("base64"),
    ].join("\r\n");
  }

  const boundary = `pmcconnext_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.text, "utf8").toString("base64"),
  ];

  attachments.forEach((attachment) => {
    const filename = sanitizeHeader(attachment.filename || "attachment");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n")
    );
  });

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

export async function sendGmailWithAttachments(input: SendGmailInput) {
  const recipients = Array.from(new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (recipients.length === 0) throw new Error("No email recipients provided");

  const delegatedAuth = getDelegatedGoogleAuth(["https://www.googleapis.com/auth/gmail.send"]);
  const sender = process.env.GMAIL_SENDER_EMAIL || process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || "";
  if (!delegatedAuth || !sender) {
    throw new Error("Gmail sender is not configured. Set GMAIL_SENDER_EMAIL or GOOGLE_WORKSPACE_ADMIN_EMAIL with delegated Gmail access.");
  }

  const gmail = google.gmail({ version: "v1", auth: delegatedAuth });
  const raw = buildMimeMessage({ ...input, to: recipients }, sender);
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: toBase64Url(raw) },
  });

  return {
    sender,
    messageId: response.data.id || "",
    threadId: response.data.threadId || "",
  };
}
