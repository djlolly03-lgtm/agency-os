import { delta } from "@/lib/format";

export function KpiTile({
  label, value, sub, prev, prevLabel, invert,
}: {
  label: string;
  value: string;
  sub?: string;
  /** current & previous raw numbers for the delta chip */
  prev?: { current: number; previous: number };
  prevLabel?: string;
  /** true when down is good (CPA, CPC, CPM) */
  invert?: boolean;
}) {
  const d = prev ? delta(prev.current, prev.previous) : null;
  const good = d && d.dir !== "flat" ? (d.dir === "up") !== Boolean(invert) : null;
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        {d && d.pct != null && (
          <span
            className="inline-flex items-center gap-0.5 font-medium"
            style={{ color: good ? "var(--delta-good)" : "var(--status-critical)" }}
          >
            <span aria-hidden>{d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"}</span>
            {Math.abs(d.pct * 100).toFixed(0)}%
          </span>
        )}
        {(prevLabel || sub) && <span>{prevLabel ?? sub}</span>}
      </div>
    </div>
  );
}
