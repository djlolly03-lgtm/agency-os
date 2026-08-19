import { NextResponse } from "next/server";
import { runSheetSync } from "@/lib/sync";
import { indexDriveAssets } from "@/lib/drive-index";
import { ingestShopifyOrders } from "@/lib/shopify";
import { ingestRetentionChannels } from "@/lib/retention";

export const maxDuration = 300;

/**
 * POST /api/v1/sync — pull the sheet + reindex Drive assets.
 * Protected by SYNC_SECRET (Authorization: Bearer <secret>).
 * Vercel cron hits this on a schedule (see vercel.json).
 */
export async function POST(req: Request) {
  // Vercel cron authenticates with CRON_SECRET; manual calls with SYNC_SECRET.
  const secrets = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(Boolean);
  const auth = req.headers.get("authorization") ?? "";
  if (!secrets.length || !secrets.some((s) => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const sheet = await runSheetSync("organik-truck");
    let drive: unknown = null;
    if (process.env.DRIVE_FOLDER_ID) {
      drive = await indexDriveAssets("organik-truck");
    }
    let shopify: unknown = null;
    let retention: unknown = null;
    if (process.env.CUSTOMER_DATA_SHEET_ID) {
      shopify = await ingestShopifyOrders("organik-truck");
      retention = await ingestRetentionChannels("organik-truck");
    }
    return NextResponse.json({ data: { sheet, drive, shopify, retention } });
  } catch (e) {
    console.error("[sync]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Vercel cron sends GET
export async function GET(req: Request) {
  return POST(req);
}
