/**
 * Manual Drive index run: npm run index-drive
 * Requires GOOGLE_SA_KEY(_FILE) + DRIVE_FOLDER_ID.
 */
import { indexDriveAssets } from "../src/lib/drive-index";

indexDriveAssets("organik-truck")
  .then((r) => { console.log(r); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
