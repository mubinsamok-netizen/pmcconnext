import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ACCOUNTING_UNKNOWN_FOLDER_ID, appendAccountingTransaction } from "@/lib/accountingSlips";
import { uploadFile } from "@/lib/drive";
import { replyLineMessages } from "@/lib/line";

export const runtime = "nodejs";

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";

type LineSource = {
  type?: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
};

type LineMessage = {
  id?: string;
  type?: string;
  text?: string;
};

type LineEvent = {
  type?: string;
  mode?: string;
  timestamp?: number;
  webhookEventId?: string;
  replyToken?: string;
  source?: LineSource;
  message?: LineMessage;
};

function verifyLineSignature(rawBody: string, signature: string | null) {
  if (!LINE_CHANNEL_SECRET) {
    console.warn("LINE_CHANNEL_SECRET is not configured; signature verification skipped.");
    return true;
  }

  if (!signature) return false;

  const digest = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");

  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function extensionFromMimeType(mimeType: string | null) {
  if (mimeType?.includes("png")) return "png";
  if (mimeType?.includes("webp")) return "webp";
  return "jpg";
}

function formatBangkokTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}_${values.hour}${values.minute}${values.second}`;
}

function sourceTarget(source?: LineSource) {
  return source?.groupId || source?.roomId || source?.userId || "";
}

async function fetchLineImage(messageId: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  }

  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to fetch LINE image: ${response.status} ${response.statusText}. ${detail}`);
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

async function replyText(replyToken: string | undefined, text: string) {
  if (!replyToken) return;
  try {
    await replyLineMessages([{ type: "text", text }], replyToken);
  } catch (error) {
    console.error("Failed to reply LINE webhook:", error);
  }
}

async function handleImageEvent(event: LineEvent) {
  const messageId = event.message?.id;
  if (!messageId) return { handled: false, reason: "missing_message_id" };
  if (!ACCOUNTING_UNKNOWN_FOLDER_ID) throw new Error("AI_ACCOUNTING_UNKNOWN_FOLDER_ID is not configured");

  const image = await fetchLineImage(messageId);
  const fileName = `${formatBangkokTimestamp()}_line_${messageId}.${extensionFromMimeType(image.mimeType)}`;
  const file = await uploadFile(fileName, image.mimeType, image.buffer, ACCOUNTING_UNKNOWN_FOLDER_ID);

  await appendAccountingTransaction({
    line_source_type: event.source?.type || "",
    line_group_id: sourceTarget(event.source),
    line_user_id: event.source?.userId || "",
    message_id: messageId,
    webhook_event_id: event.webhookEventId || "",
    document_type: "unknown",
    cost_owner_type: "unknown",
    drive_file_url: file.webViewLink || "",
    drive_file_id: file.id || "",
    raw_ai_json: "{}",
    confidence: "",
    status: "needs_review",
    review_note: "MVP captured image from LINE; OCR and owner mapping pending.",
  });

  await replyText(
    event.replyToken,
    [
      "รับสลิป/บิลแล้วครับ",
      "เก็บรูปเข้า Drive และลงรายการใน Google Sheets เป็น needs_review แล้ว",
      "รอบถัดไปจะต่อ AI อ่านยอดเงินและถาม Site/คนทำเรื่องอัตโนมัติ",
    ].join("\n")
  );

  return { handled: true, fileId: file.id };
}

async function handleTextEvent(event: LineEvent) {
  const text = event.message?.text?.trim() || "";
  if (!text) return { handled: false, reason: "empty_text" };

  if (/^(ping|test|ทดสอบ)$/i.test(text)) {
    await replyText(event.replyToken, "ระบบบัญชี AI พร้อมรับรูปสลิปแล้วครับ");
    return { handled: true, command: "ping" };
  }

  return { handled: false, reason: "text_not_supported_yet" };
}

async function handleEvent(event: LineEvent) {
  if (event.type !== "message") return { handled: false, reason: "not_message_event" };
  if (event.message?.type === "image") return handleImageEvent(event);
  if (event.message?.type === "text") return handleTextEvent(event);
  return { handled: false, reason: "unsupported_message_type" };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"))) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const events = payload.events || [];
  const results = [];

  for (const event of events) {
    try {
      results.push(await handleEvent(event));
    } catch (error) {
      console.error("Accounting LINE webhook event failed:", error);
      await replyText(event.replyToken, "รับข้อความแล้ว แต่บันทึกรายการไม่สำเร็จ กรุณาแจ้งแอดมินตรวจสอบระบบครับ");
      results.push({ handled: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({ ok: true, results });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/accounting/line-webhook",
    status: "ready",
  });
}
