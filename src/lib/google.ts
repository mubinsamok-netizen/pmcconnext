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
  ],
});

export const sheets = google.sheets({ version: "v4", auth });
export const drive = google.drive({ version: "v3", auth });

export const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
export const DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
