import { google } from "googleapis";

// Ensure private key is correctly formatted if it comes from env vars
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: privateKey,
  },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
  ],
});

export const sheets = google.sheets({ version: "v4", auth });
export const drive = google.drive({ version: "v3", auth });
export const calendar = google.calendar({ version: "v3", auth });

export function getDelegatedGoogleAuth(scopes: string[]) {
  const subject = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || process.env.GMAIL_SENDER_EMAIL || "";
  if (!subject || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !privateKey) return null;

  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes,
    subject,
  });
}

export const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
export const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID || process.env.MASTER_SHEET_ID || SHEET_ID;
export const DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
