import { NextResponse } from "next/server";
import { setupProjectFolders } from "@/lib/drive";
import { insert, findAll } from "@/lib/sheetsCrud";

export async function GET() {
  try {
    const projects = await findAll("Projects");
    return NextResponse.json({ success: true, data: projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, name, client, start_date, end_date, budget } = body;

    if (!project_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Setup Drive Folders
    let driveFolderId = "";
    try {
      const folders = await setupProjectFolders(`${project_id} - ${name}`);
      driveFolderId = folders.root;
    } catch (e: any) {
      console.error("Drive setup failed:", e);
      // We continue even if Drive fails, just log it, or we could fail the request.
      // Failing the request is safer to maintain consistency.
      return NextResponse.json({ error: "Failed to setup Drive folders: " + e.message }, { status: 500 });
    }

    // 2. Insert into Sheets
    const projectData = {
      project_id,
      name,
      client,
      start_date,
      end_date,
      budget,
      status: "Planning",
      drive_folder_id: driveFolderId
    };

    const result = await insert("Projects", projectData);

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: any) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
