import { inrCompact, monthLabel } from "@/lib/format";
import { seasonLabel, type Produce } from "@/lib/seasons";

type CalRow = {
  produce: Produce;
  total: number;
  cells: Array<{ month: string; inSeason: boolean; peak: boolean; spend: number; revenue: number; intensity: number }>;
};

/**
 * The season calendar: rows = produce, columns = months.
 * Soft band = nature's window (deeper = peak). Dot = our actual revenue.
 * The story is the overlap — dots inside bands mean we sold with the season.
 */
export function SeasonCalendar({ rows, months }: { rows: CalRow[]; months: string[] }) {
  if (!rows.length) return null;
  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Season calendar — window vs what we sold</h3>
        <span className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded"
              style={{ background: "color-mix(in srgb, var(--brand) 16%, transparent)" }} /> in season
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded"
              style={{ background: "color-mix(in srgb, var(--brand) 32%, transparent)" }} /> peak
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand)" }} /> revenue
          </span>
        </span>
      </div>
      <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
        Dots inside the band = selling with the season. Dots outside = fighting it. Empty bands = missed windows.
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* header months */}
          <div className="grid items-center gap-1"
            style={{ gridTemplateColumns: `150px repeat(${months.length}, 1fr)` }}>
            <span />
            {months.map((m) => (
              <span key={m} className="text-center text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}>
                {monthLabel(m.slice(0, 7)).split(" ")[0]}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.produce.key} className="mt-1 grid items-center gap-1"
              style={{ gridTemplateColumns: `150px repeat(${months.length}, 1fr)` }}>
              <span className="truncate pr-2 text-xs">
                <span className="font-semibold">{r.produce.label}</span>
                <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>{seasonLabel(r.produce)}</span>
              </span>
              {r.cells.map((c) => (
                <span key={c.month}
                  className="relative flex h-8 items-center justify-center rounded-md"
                  title={`${r.produce.label} · ${monthLabel(c.month.slice(0, 7))} · ${c.revenue > 0 ? `${inrCompact(c.revenue)} revenue` : "no sales"}${c.inSeason ? c.peak ? " · peak season" : " · in season" : " · out of season"}`}
                  style={{
                    background: c.inSeason
                      ? `color-mix(in srgb, var(--brand) ${c.peak ? 32 : 16}%, transparent)`
                      : "color-mix(in srgb, var(--grid) 55%, transparent)",
                  }}>
                  {c.revenue > 0 && (
                    <span className="rounded-full"
                      style={{
                        width: 6 + c.intensity * 14, height: 6 + c.intensity * 14,
                        background: c.inSeason ? "var(--brand)" : "var(--status-serious)",
                        boxShadow: c.inSeason ? "0 0 10px color-mix(in srgb, var(--brand) 60%, transparent)" : "none",
                      }} />
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
