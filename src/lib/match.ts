/**
 * Creative filename ↔ ad name matching.
 *
 * Reality: historical ad names follow no convention ("AVOCADOS 31OCT – Copy",
 * "Mangoes | 24th Apr'26 | Sales Ad 1 | Static"). So we match in tiers:
 *   exact  — normalized filename == normalized ad name
 *   fuzzy  — token-set similarity ≥ threshold (recorded with confidence,
 *            confirmable in the internal UI)
 *   manual — a human said so (always wins)
 */

const STOP = new Set(["ad", "ads", "copy", "the", "a", "of", "and", "sales", "campaign"]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(mp4|mov|jpg|jpeg|png|gif|webp|webm)$/i, "")
    .replace(/[–—|]/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t && !STOP.has(t)));
}

/** Token-set Jaccard similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface MatchCandidate {
  adId: string; adName: string;
  assetId: string; filename: string;
  matchType: "exact" | "fuzzy";
  confidence: number;
}

export const FUZZY_THRESHOLD = 0.55;

/** Best asset per ad (greedy, highest confidence first). */
export function matchAssets(
  ads: Array<{ id: string; name: string }>,
  assets: Array<{ id: string; filename: string }>
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const ad of ads) {
    for (const asset of assets) {
      if (normalize(ad.name) === normalize(asset.filename)) {
        candidates.push({ adId: ad.id, adName: ad.name, assetId: asset.id, filename: asset.filename, matchType: "exact", confidence: 1 });
      } else {
        const sim = similarity(ad.name, asset.filename);
        if (sim >= FUZZY_THRESHOLD) {
          candidates.push({ adId: ad.id, adName: ad.name, assetId: asset.id, filename: asset.filename, matchType: "fuzzy", confidence: sim });
        }
      }
    }
  }
  // one best asset per ad
  candidates.sort((a, b) => b.confidence - a.confidence);
  const seenAds = new Set<string>();
  return candidates.filter((c) => {
    if (seenAds.has(c.adId)) return false;
    seenAds.add(c.adId);
    return true;
  });
}
