import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { googleAuth } from "@/lib/google";

/**
 * Thumbnail proxy: streams a creative's Drive thumbnail through the service
 * account so client pageloads never hit Drive auth/quota directly.
 *
 * Drive thumbnailLinks EXPIRE (hours, not days) — and when stale they return
 * an HTML page with status 200, not an error. So: only ever accept image/*
 * responses, and re-fetch a fresh link from Drive metadata whenever the
 * stored one has gone stale. Good bytes are cached at the edge for a day.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const db = await getDb();
  const [asset] = await db.query<{ drive_file_id: string; thumbnail_url: string | null }>(
    `select drive_file_id, thumbnail_url from creative_assets where id = $1`, [assetId]);
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const auth = googleAuth();
    const { token } = await auth.getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const isImage = (r: Response | null): r is Response =>
      !!r && r.ok && /^image\//.test(r.headers.get("content-type") ?? "");

    let img = asset.thumbnail_url ? await fetch(asset.thumbnail_url, { headers }) : null;

    if (!isImage(img)) {
      // stored link stale or missing — get a fresh one from Drive metadata
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${asset.drive_file_id}?fields=thumbnailLink`,
        { headers });
      const meta = (await metaRes.json()) as { thumbnailLink?: string };
      if (!meta.thumbnailLink) return NextResponse.json({ error: "no thumbnail" }, { status: 404 });
      img = await fetch(meta.thumbnailLink, { headers });
      if (isImage(img)) {
        await db.query(`update creative_assets set thumbnail_url = $1 where id = $2`,
          [meta.thumbnailLink, assetId]);
      }
    }

    if (!isImage(img)) return NextResponse.json({ error: "thumbnail fetch failed" }, { status: 502 });
    return new NextResponse(img.body, {
      headers: {
        "Content-Type": img.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    console.error("[thumb]", e);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
