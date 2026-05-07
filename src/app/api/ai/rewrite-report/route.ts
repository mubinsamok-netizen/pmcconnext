import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

const modeInstructions = {
  formal: "ปรับข้อความให้เป็นภาษารายงานก่อสร้างที่เป็นทางการ ชัดเจน และอ่านลื่นขึ้น",
  concise: "สรุปข้อความให้กระชับ แต่ยังคงข้อมูลสำคัญครบถ้วน",
  detailed: "เรียบเรียงให้ละเอียดขึ้นเฉพาะจากข้อมูลที่ผู้ใช้ให้มา ห้ามเติมข้อเท็จจริงใหม่",
  spelling: "แก้คำผิด เว้นวรรค และจัดประโยคให้อ่านง่าย โดยเปลี่ยนความหมายน้อยที่สุด",
} as const;

const fieldLabels = {
  work_done: "รายการงานที่ปฏิบัติ",
  issues: "ปัญหา/อุปสรรค",
  solutions: "แนวทางการแก้ไข",
} as const;

type RewriteMode = keyof typeof modeInstructions;
type RewriteField = keyof typeof fieldLabels;
type AiProvider = "openai" | "gemini";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type GeminiError = Error & {
  status?: number;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function isRewriteMode(value: unknown): value is RewriteMode {
  return typeof value === "string" && value in modeInstructions;
}

function isRewriteField(value: unknown): value is RewriteField {
  return typeof value === "string" && value in fieldLabels;
}

function getPrompt(field: RewriteField, mode: RewriteMode, text: string) {
  return [
    `ช่องรายงาน: ${fieldLabels[field]}`,
    `งานที่ต้องการ: ${modeInstructions[mode]}`,
    "",
    "ข้อความต้นฉบับ:",
    text,
  ].join("\n");
}

function getSystemInstruction() {
  return [
    "คุณเป็นผู้ช่วยเรียบเรียงรายงานประจำวันงานก่อสร้างภาษาไทย",
    "ห้ามเพิ่มข้อเท็จจริง ตัวเลข สถานะ สาเหตุ หรือเหตุการณ์ที่ผู้ใช้ไม่ได้ระบุ",
    "คงชื่อวัสดุ ชื่องาน จำนวน วันที่ และคำเฉพาะทางให้ตรงกับต้นฉบับ",
    "ห้ามใส่หัวข้อ ห้ามใช้ Markdown ห้ามใช้ bullet ห้ามเติม placeholder เช่น [ระบุวันที่]",
    "ตอบกลับเป็นย่อหน้าข้อความรายงานที่ปรับปรุงแล้วเท่านั้น ไม่ต้องมีคำอธิบาย",
  ].join("\n");
}

function extractOpenAIText(data: OpenAIResponse) {
  if (typeof data.output_text === "string") return data.output_text.trim();

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}

function extractGeminiText(data: GeminiResponse) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function resolveProvider(): AiProvider {
  const requested = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (requested === "gemini" || requested === "openai") return requested;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  return "openai";
}

async function rewriteWithOpenAI(prompt: string, systemInstruction: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า OPENAI_API_KEY");

  const model = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 700,
      input: [
        { role: "developer", content: systemInstruction },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await response.json().catch(() => ({})) as OpenAIResponse;
  if (!response.ok) {
    const fallbackError = response.status === 401
      ? "OPENAI_API_KEY ไม่ถูกต้อง หรือยังไม่ได้เปิดใช้งาน"
      : response.status === 429
        ? "OpenAI ตอบ 429: เครดิต/โควต้าไม่พอ หรือเรียกถี่เกินไป กรุณาเช็ก Billing และ Usage ใน OpenAI Platform"
        : `OpenAI request failed (${response.status})`;
    throw new Error(data.error?.message || fallbackError);
  }

  return { suggestion: extractOpenAIText(data), model, provider: "openai" as const };
}

async function rewriteWithGemini(prompt: string, systemInstruction: string) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");

  const primaryModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite,gemini-2.0-flash")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = Array.from(new Set([primaryModel, ...fallbackModels]));
  let lastError: GeminiError | null = null;

  for (const model of models) {
    try {
      return await rewriteWithGeminiModel({ apiKey, model, prompt, systemInstruction });
    } catch (error) {
      const geminiError = error as GeminiError;
      lastError = geminiError;
      if (geminiError.status !== 429 && geminiError.status !== 503) throw geminiError;
    }
  }

  throw lastError || new Error("Gemini request failed");
}

async function rewriteWithGeminiModel({
  apiKey,
  model,
  prompt,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction: string;
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  const data = await response.json().catch(() => ({})) as GeminiResponse;
  if (!response.ok) {
    const fallbackError = response.status === 400
      ? "Gemini request ไม่ถูกต้อง กรุณาเช็ก GEMINI_MODEL"
      : response.status === 403
        ? "Gemini API key ไม่มีสิทธิ์ใช้งาน หรือยังไม่ได้เปิด Generative Language API"
        : response.status === 429
          ? "Gemini ตอบ 429: โควต้าไม่พอ หรือเรียกถี่เกินไป"
          : `Gemini request failed (${response.status})`;
    const error = new Error(data.error?.message || fallbackError) as GeminiError;
    error.status = response.status;
    throw error;
  }

  return { suggestion: extractGeminiText(data), model, provider: "gemini" as const };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const requestedMode: unknown = body.mode;
    const requestedField: unknown = body.field;
    const mode: RewriteMode = isRewriteMode(requestedMode) ? requestedMode : "formal";
    const field: RewriteField = isRewriteField(requestedField) ? requestedField : "work_done";

    if (!text) {
      return NextResponse.json({ error: "กรุณากรอกข้อความก่อนใช้ AI" }, { status: 400 });
    }

    if (text.length > 4000) {
      return NextResponse.json({ error: "ข้อความยาวเกินไป กรุณาย่อให้สั้นลงก่อน" }, { status: 400 });
    }

    const provider = resolveProvider();
    const prompt = getPrompt(field, mode, text);
    const systemInstruction = getSystemInstruction();
    const result = provider === "gemini"
      ? await rewriteWithGemini(prompt, systemInstruction)
      : await rewriteWithOpenAI(prompt, systemInstruction);

    if (!result.suggestion) {
      return NextResponse.json({ error: "AI ไม่ได้ส่งข้อความกลับมา" }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
