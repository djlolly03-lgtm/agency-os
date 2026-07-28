/**
 * Seasonal intelligence — the produce calendar in the dashboard's DNA.
 *
 * Organik Truck sells fresh produce; almost every campaign/ad name carries
 * the item ("Mangoes | 24th Apr'26 | …", "Litchi | 19th May'26", "Strawberry
 * 11 Jan Reel"). Each item has an Indian season window. Classifying spend by
 * produce and joining it to the calendar answers three questions no generic
 * dashboard can: are we riding the season, what window are we missing, and
 * where are we spending against nature?
 *
 * Season months are India-market approximations — editable in one place here.
 */

export interface Produce {
  key: string;
  label: string;
  re: RegExp;
  /** months in season, 1–12 (may wrap the year) */
  months: number[];
  /** peak months (subset) */
  peak: number[];
}

const M = (...xs: number[]) => xs;
const range = (a: number, b: number) => {
  const out: number[] = [];
  for (let m = a; ; m = (m % 12) + 1) { out.push(m); if (m === b) break; }
  return out;
};

/** Order matters: first match wins. "jam"/processed items are excluded upstream. */
export const PRODUCE: Produce[] = [
  { key: "mango", label: "Mango", re: /mango(?!steen)|alphonso|alphanso|kesar|payari|hapus/i, months: range(3, 7), peak: M(4, 5, 6) },
  { key: "mangosteen", label: "Mangosteen", re: /mangosteen/i, months: range(5, 9), peak: M(6, 7, 8) },
  { key: "litchi", label: "Litchi", re: /litchi|lychee/i, months: range(5, 7), peak: M(5, 6) },
  { key: "strawberry", label: "Strawberry", re: /strawberr/i, months: range(12, 3), peak: M(1, 2) },
  { key: "grapes", label: "Grapes", re: /grape/i, months: range(12, 4), peak: M(1, 2, 3) },
  { key: "orange", label: "Orange", re: /orange|santra|nagpur/i, months: range(11, 3), peak: M(12, 1, 2) },
  { key: "kiwi", label: "Kiwi", re: /kiwi/i, months: range(10, 2), peak: M(11, 12) },
  { key: "watermelon", label: "Watermelon", re: /watermelon|tarbuj/i, months: range(3, 6), peak: M(4, 5) },
  { key: "cherry", label: "Cherry", re: /cherry/i, months: range(5, 7), peak: M(6) },
  { key: "apricot", label: "Apricot", re: /apricot/i, months: range(5, 7), peak: M(6) },
  { key: "plum", label: "Plum", re: /plum/i, months: range(5, 8), peak: M(6, 7) },
  { key: "peach", label: "Peach & Nectarine", re: /peach|nectarine/i, months: range(5, 8), peak: M(6, 7) },
  { key: "rambutan", label: "Rambutan", re: /rambutan/i, months: range(6, 9), peak: M(7, 8) },
  { key: "chikoo", label: "Chikoo", re: /chikoo|sapota/i, months: range(12, 5), peak: M(2, 3, 4) },
  { key: "persimmon", label: "Persimmon", re: /persimmon/i, months: range(10, 12), peak: M(10, 11) },
  { key: "ponkh", label: "Ponkh", re: /ponkh/i, months: range(12, 2), peak: M(12, 1) },
  { key: "passion", label: "Passion fruit", re: /passion/i, months: range(7, 11), peak: M(8, 9) },
  { key: "goldenberry", label: "Golden berry", re: /golden ?berry|physalis/i, months: range(12, 3), peak: M(1, 2) },
  { key: "avocado", label: "Avocado", re: /avocado/i, months: range(6, 10), peak: M(7, 8, 9) },
  { key: "jamun", label: "Jamun", re: /jamun/i, months: range(6, 8), peak: M(6, 7) },
  { key: "mulberry", label: "Mulberry", re: /mulberr/i, months: range(3, 5), peak: M(3, 4) },
  { key: "airpotato", label: "Air potato", re: /air ?potato/i, months: range(11, 1), peak: M(11, 12) },
  { key: "mushroom", label: "Mushroom", re: /mushroom/i, months: range(1, 12), peak: [] },
  { key: "exotic", label: "Exotic mix", re: /exotic/i, months: range(1, 12), peak: [] },
];

const PROCESSED = /jam\b|jamun ?jam|pickle|preserve|juice|powder/i;

/** Classify a campaign/ad name pair to a produce item (campaign name wins). */
export function classifyProduce(campaign: string, ad?: string | null): Produce | null {
  for (const source of [campaign, ad ?? ""]) {
    if (!source || PROCESSED.test(source)) continue;
    for (const p of PRODUCE) if (p.re.test(source)) return p;
  }
  return null;
}

export const inSeason = (p: Produce, month: number) => p.months.includes(month);
export const atPeak = (p: Produce, month: number) => p.peak.includes(month);
/** true when the window closes after this month (last in-season month). */
export const windowClosing = (p: Produce, month: number) =>
  inSeason(p, month) && !inSeason(p, (month % 12) + 1) && p.months.length < 12;
export const seasonLabel = (p: Produce) => {
  if (p.months.length >= 12) return "year-round";
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[p.months[0]]}–${names[p.months[p.months.length - 1]]}`;
};

export interface ProduceMonthAgg {
  produce: Produce;
  spend: number;
  revenue: number;
  purchases: number;
  inSeason: boolean;
  atPeak: boolean;
  closing: boolean;
}

/** Aggregate name-level rollups into produce buckets for a given month. */
export function aggregateProduceMonth(
  rows: Array<{ campaign: string; ad?: string | null; spend: number; revenue: number; purchases?: number }>,
  monthNum: number,
): ProduceMonthAgg[] {
  const map = new Map<string, ProduceMonthAgg>();
  for (const r of rows) {
    const p = classifyProduce(r.campaign, r.ad);
    if (!p || p.months.length >= 12) continue;   // seasonal items only
    const a = map.get(p.key) ?? {
      produce: p, spend: 0, revenue: 0, purchases: 0,
      inSeason: inSeason(p, monthNum), atPeak: atPeak(p, monthNum), closing: windowClosing(p, monthNum),
    };
    a.spend += r.spend; a.revenue += r.revenue; a.purchases += r.purchases ?? 0;
    map.set(p.key, a);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * Season radar buckets for a month.
 * `historicalKeys` = produce we have EVER sold (from all-history rollups),
 * so "missed window" only flags items actually in the assortment.
 */
export function seasonRadar(agg: ProduceMonthAgg[], monthNum: number, historicalKeys: Set<string>) {
  const byKey = new Map(agg.map((a) => [a.produce.key, a]));
  // zero-fill in-season produce we've sold historically but aren't running now
  for (const p of PRODUCE) {
    if (p.months.length >= 12) continue;
    if (!inSeason(p, monthNum)) continue;
    if (!historicalKeys.has(p.key)) continue;
    if (!byKey.has(p.key)) {
      byKey.set(p.key, {
        produce: p, spend: 0, revenue: 0, purchases: 0,
        inSeason: true, atPeak: atPeak(p, monthNum), closing: windowClosing(p, monthNum),
      });
    }
  }
  const all = [...byKey.values()];
  const riding = all.filter((a) => a.inSeason && a.spend > 0).sort((x, y) => y.revenue - x.revenue);
  const offSeason = all.filter((a) => !a.inSeason && a.spend > 0).sort((x, y) => y.spend - x.spend);
  const missed = all.filter((a) => a.inSeason && a.spend === 0);
  const closing = riding.filter((a) => a.closing);
  return { riding, offSeason, missed, closing };
}

/** Produce × month grid for the season calendar visual. */
export function buildSeasonCalendar(
  rows: Array<{ month: string; campaign: string; ad?: string | null; spend: number; revenue: number }>,
  months: string[],                      // ascending YYYY-MM-01
  topN = 9,
) {
  const byProduce = new Map<string, { produce: Produce; total: number; cells: Map<string, { spend: number; revenue: number }> }>();
  for (const r of rows) {
    const p = classifyProduce(r.campaign, r.ad);
    if (!p || p.months.length >= 12) continue;
    const e = byProduce.get(p.key) ?? { produce: p, total: 0, cells: new Map() };
    const c = e.cells.get(r.month) ?? { spend: 0, revenue: 0 };
    c.spend += r.spend; c.revenue += r.revenue;
    e.cells.set(r.month, c);
    e.total += r.revenue;
    byProduce.set(p.key, e);
  }
  const top = [...byProduce.values()].sort((a, b) => b.total - a.total).slice(0, topN);
  const maxRev = Math.max(1, ...top.flatMap((e) => [...e.cells.values()].map((c) => c.revenue)));
  return top.map((e) => ({
    produce: e.produce,
    total: e.total,
    cells: months.map((m) => {
      const monthNum = Number(m.slice(5, 7));
      const c = e.cells.get(m);
      return {
        month: m, monthNum,
        inSeason: inSeason(e.produce, monthNum),
        peak: atPeak(e.produce, monthNum),
        spend: c?.spend ?? 0, revenue: c?.revenue ?? 0,
        intensity: c ? Math.sqrt(c.revenue / maxRev) : 0,
      };
    }),
  }));
}
