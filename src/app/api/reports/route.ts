import { NextResponse } from "next/server";
import { insert, findAll } from "@/lib/sheetsCrud";
import { uploadFile, findOrCreateFolder } from "@/lib/drive";

export async function GET() {
  try {
    const reports = await findAll("Daily_Reports");
    return NextResponse.json({ success: true, data: reports });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID!;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    const project_id = formData.get("project_id") as string;
    const project_drive_folder_id = formData.get("project_drive_folder_id") as string;
    const date = formData.get("date") as string;
    const weather = formData.get("weather") as string;
    const workers = formData.get("workers") as string;
    const work_done = formData.get("work_done") as string;
    const issues = formData.get("issues") as string;
    
    if (!project_id || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Upload photos to Drive
    let photos_folder_id = "";
    const photos = formData.getAll("photos") as File[];
    const uploadedPhotoUrls: string[] = [];

    if (photos.length > 0 && project_drive_folder_id) {
      // Find or create "Daily Reports" subfolder inside the project folder
      const dailyReportsFolder = await findOrCreateFolder("Daily Reports", project_drive_folder_id);
      
      // Create a specific folder for today's date
      const todayFolder = await findOrCreateFolder(date, dailyReportsFolder.id!);
      photos_folder_id = todayFolder.id!;

      for (const file of photos) {
        if (file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const uploadedFile = await uploadFile(file.name, file.type, buffer, photos_folder_id);
          if (uploadedFile.webViewLink) {
            uploadedPhotoUrls.push(uploadedFile.webViewLink);
          }
        }
      }
    }

    // 2. Insert to Google Sheets
    const report_id = `REP-${Date.now().toString().slice(-6)}`;
    const reportData = {
      report_id,
      project_id,
      date,
      weather,
      workers,
      work_done,
      issues,
      photos_folder_id,
    };

    const result = await insert("Daily_Reports", reportData);

    // 3. Send LINE Flex Message
    if (LINE_CHANNEL_ACCESS_TOKEN) {
      const flexMessage = {
        type: "flex",
        altText: `รายงานประจำวัน: ${project_id} (${date})`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#ea580c",
            contents: [
              {
                type: "text",
                text: "DAILY REPORT",
                color: "#ffffff",
                weight: "bold",
                size: "sm"
              },
              {
                type: "text",
                text: project_id,
                color: "#ffffff",
                weight: "bold",
                size: "xl",
                margin: "md"
              }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "วันที่", color: "#888888", size: "sm", flex: 2 },
                  { type: "text", text: date, color: "#111111", size: "sm", flex: 5, weight: "bold" }
                ]
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "สภาพอากาศ", color: "#888888", size: "sm", flex: 2 },
                  { type: "text", text: weather, color: "#111111", size: "sm", flex: 5 }
                ]
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "คนงาน", color: "#888888", size: "sm", flex: 2 },
                  { type: "text", text: `${workers} คน`, color: "#111111", size: "sm", flex: 5 }
                ]
              },
              { type: "separator", margin: "md" },
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                contents: [
                  { type: "text", text: "งานที่ดำเนินการ", color: "#888888", size: "sm" },
                  { type: "text", text: work_done, color: "#111111", size: "sm", wrap: true, margin: "sm" }
                ]
              }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              ...(photos_folder_id ? [{
                type: "button",
                style: "primary",
                color: "#ea580c",
                action: {
                  type: "uri",
                  label: "ดูรูปภาพหน้างาน",
                  uri: `https://drive.google.com/drive/folders/${photos_folder_id}`
                }
              }] : [])
            ]
          }
        }
      };

      try {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: LINE_GROUP_ID,
            messages: [flexMessage],
          }),
        });
      } catch (lineErr) {
        console.error("Failed to send LINE notification", lineErr);
      }
    }

    return NextResponse.json({ success: true, data: result.inserted });
  } catch (error: any) {
    console.error("Failed to create report:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
