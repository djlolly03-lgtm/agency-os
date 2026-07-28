import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { googleAuth } from "@/lib/google";

/**
 * Thumbnail proxy: streams a creative's Drive thumbnail through the service
 * account so client pageloads never hit Drive auth/quota directly.
 * Cached at the edge for a day.
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
    // thumbnailLink can go stale; refresh it if missing
    let url = asset.thumbnail_url;
    if (!url) {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${asset.drive_file_id}?fields=thumbnailLink`,
        { headers: { Authorization: `Bearer ${token}` } });
      const meta = (await metaRes.json()) as { thumbnailLink?: string };
      url = meta.thumbnailLink ?? null;
    }
    if (!url) return NextResponse.json({ error: "no thumbnail" }, { status: 404 });

    const img = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!img.ok) return NextResponse.json({ error: "thumbnail fetch failed" }, { status: 502 });
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
