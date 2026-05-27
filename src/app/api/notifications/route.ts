import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: true, data: [], unread_count: 0 });
}

export async function PATCH() {
  return NextResponse.json({ success: true, updated: 0 });
}
