/**
 * Google API clients (Sheets + Drive) via service account.
 *
 * Env:
 * - GOOGLE_SA_KEY: base64-encoded service-account JSON key
 *   (or GOOGLE_SA_KEY_FILE: path to the JSON file, for local dev)
 * - SHEET_ID: the Organik Truck workbook id
 * - DRIVE_FOLDER_ID: the creatives folder id
 *
 * The sheet AND the folder must be shared (viewer) with the service
 * account's client_email.
 */
import { google } from "googleapis";
import fs from "node:fs";

function loadKey(): { client_email: string; private_key: string } {
  const b64 = process.env.GOOGLE_SA_KEY;
  const file = process.env.GOOGLE_SA_KEY_FILE;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  throw new Error("Set GOOGLE_SA_KEY (base64 JSON) or GOOGLE_SA_KEY_FILE (path)");
}

export function googleAuth() {
  const key = loadKey();
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

export function sheetsClient() {
  return google.sheets({ version: "v4", auth: googleAuth() });
}

export function driveClient() {
  return google.drive({ version: "v3", auth: googleAuth() });
}
