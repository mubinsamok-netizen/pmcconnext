import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/sheetsSetup";

export async function POST() {
  try {
    const result = await ensureSchema();
    if (result.success) {
      return NextResponse.json({ message: "Schema ensured successfully" }, { status: 200 });
    } else {
      return NextResponse.json({ error: "Failed to ensure schema", details: result.error }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error", details: error }, { status: 500 });
  }
}
