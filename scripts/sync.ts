/**
 * Manual sync run: npm run sync
 * Requires GOOGLE_SA_KEY(_FILE) + SHEET_ID (see .env.example).
 */
import { runSheetSync } from "../src/lib/sync";

runSheetSync("organik-truck")
  .then((r) => {
    console.log(`synced: ${r.meta} meta rows, ${r.google} google rows`);
    if (r.anomalies.length) {
      console.log(`anomalies (${r.anomalies.length}):`);
      r.anomalies.slice(0, 15).forEach((a) => console.log(` - [${a.kind}] ${a.detail}`));
    }
    process.exit(0);
  })
  .catch((e) => { console.error(e); process.exit(1); });
