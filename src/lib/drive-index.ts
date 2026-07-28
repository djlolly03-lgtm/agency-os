/**
 * Drive creative indexer: lists DRIVE_FOLDER_ID (recursively), upserts
 * creative_assets, then runs the matcher and records exact/fuzzy links.
 * Manual links are never overwritten.
 */
import { getDb } from "./db";
import { driveClient } from "./google";
import { matchAssets } from "./match";

export async function indexDriveAssets(clientSlug: string) {
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("DRIVE_FOLDER_ID not set");

  const db = await getDb();
  const [client] = await db.query<{ id: string }>(
    `select id from clients where slug = $1`, [clientSlug]);
  if (!client) throw new Error(`unknown client ${clientSlug}`);

  const drive = driveClient();

  // walk folder tree
  const folders = [folderId];
  const files: Array<{ id: string; name: string; mimeType: string; thumbnailLink?: string }> = [];
  while (folders.length) {
    const parent = folders.pop()!;
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parent}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, thumbnailLink)",
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name) continue;
        if (f.mimeType === "application/vnd.google-apps.folder") folders.push(f.id);
        else if (/^(image|video)\//.test(f.mimeType ?? "")) {
          files.push({ id: f.id, name: f.name, mimeType: f.mimeType!, thumbnailLink: f.thumbnailLink ?? undefined });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  for (const f of files) {
    await db.query(
      `insert into creative_assets (client_id, drive_file_id, filename, mime_type, thumbnail_url, indexed_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (drive_file_id) do update set
         filename = excluded.filename, mime_type = excluded.mime_type,
         thumbnail_url = excluded.thumbnail_url, indexed_at = now()`,
      [client.id, f.id, f.name, f.mimeType, f.thumbnailLink ?? null]);
  }

  // match against ads that have no manual link yet
  const ads = await db.query<{ id: string; name: string }>(
    `select a.id, a.name from ads a
     join ad_sets s on s.id = a.ad_set_id
     join campaigns c on c.id = s.campaign_id
     join ad_accounts aa on aa.id = c.ad_account_id
     where aa.client_id = $1
       and not exists (select 1 from creative_links l where l.ad_id = a.id and l.match_type = 'manual')`,
    [client.id]);
  const assets = await db.query<{ id: string; filename: string }>(
    `select id, filename from creative_assets where client_id = $1`, [client.id]);

  const matches = matchAssets(
    ads.map((a) => ({ id: String(a.id), name: String(a.name) })),
    assets.map((a) => ({ id: String(a.id), filename: String(a.filename) })));

  // replace previous auto links with the fresh result
  await db.query(
    `delete from creative_links l using creative_assets ca
     where l.asset_id = ca.id and ca.client_id = $1 and l.match_type in ('exact','fuzzy')`,
    [client.id]);
  for (const m of matches) {
    await db.query(
      `insert into creative_links (ad_id, asset_id, match_type, confidence)
       values ($1,$2,$3,$4)
       on conflict (ad_id, asset_id) do update set match_type = excluded.match_type, confidence = excluded.confidence`,
      [m.adId, m.assetId, m.matchType, m.confidence]);
  }

  return {
    filesIndexed: files.length,
    adsConsidered: ads.length,
    matched: matches.length,
    exact: matches.filter((m) => m.matchType === "exact").length,
    fuzzy: matches.filter((m) => m.matchType === "fuzzy").length,
  };
}
