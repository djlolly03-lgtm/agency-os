/** Formatting helpers — Indian numbering (₹, lakh/crore separators). */

const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `₹${inrFmt.format(Math.round(v))}`;
}

export function inrCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)} L`;
  if (abs >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}

export function num(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return inrFmt.format(Math.round(v));
}

export function ratio(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v) || !isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v) || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function delta(current: number, previous: number): { pct: number | null; dir: "up" | "down" | "flat" } {
  if (!previous) return { pct: null, dir: "flat" };
  const p = (current - previous) / previous;
  return { pct: p, dir: p > 0.005 ? "up" : p < -0.005 ? "down" : "flat" };
}

export function monthLabel(isoMonth: string): string {
  const d = new Date(isoMonth + (isoMonth.length === 7 ? "-01" : "") + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function dayLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
