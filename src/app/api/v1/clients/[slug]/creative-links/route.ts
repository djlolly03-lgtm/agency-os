import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withClient } from "../route-helpers";

/** Manual creative link/unlink from the internal matching UI. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json()) as { adId?: string; assetId?: string; action?: "link" | "unlink" };
  if (!body.adId || !body.assetId || !body.action) {
    return NextResponse.json({ error: "adId, assetId, action required" }, { status: 400 });
  }
  return withClient(slug, async () => {
    const db = await getDb();
    if (body.action === "link") {
      await db.query(
        `insert into creative_links (ad_id, asset_id, match_type, confidence)
         values ($1,$2,'manual',1)
         on conflict (ad_id, asset_id) do update set match_type = 'manual', confidence = 1`,
        [body.adId, body.assetId]);
    } else {
      await db.query(`delete from creative_links where ad_id = $1 and asset_id = $2`,
        [body.adId, body.assetId]);
    }
    return { ok: true };
  });
}
