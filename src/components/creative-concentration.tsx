import { inrCompact, num, pct, ratio } from "@/lib/format";

export interface ConcentrationRow {
  name: string;
  ageDays: number | null;     // days since the ad first delivered — null when unknown
  spend: number;
  share: number;              // 0–1 of the month's ad spend
  roas: number | null;
  read: string;               // what this row means, in words
  isTail?: boolean;
}

const BAR_COLORS = ["var(--brand)", "var(--series-1)", "var(--brand-accent)", "var(--series-4)", "var(--baseline)"];

/**
 * Creative concentration — how much of the month's delivery sits on how few
 * assets, and how old those assets are. Age is the column that makes fatigue
 * legible: a 3.4× ROAS on a 58-day-old creative with no tested replacement
 * behind it is a risk, not a win.
 */
export function CreativeConcentration({ rows, topShare }: { rows: ConcentrationRow[]; topShare: number }) {
  if (rows.length < 2) return null;
  const oldest = rows.filter((r) => !r.isTail && r.ageDays != null)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))[0];

  return (
    <div className="flex flex-col gap-3">
      {/* one stacked pill of spend share */}
      <div className="flex flex-col gap-2">
        <svg viewBox="0 0 680 26" style={{ width: "100%", height: "auto", display: "block" }} role="img"
          aria-label="Spend share by creative">
          {rows.map((r, i) => {
            const before = rows.slice(0, i).reduce((t, x) => t + x.share, 0);
            return <rect key={r.name} x={before * 680} y="0"
              width={Math.max(r.share * 680 - 1.5, 1)} height="26" rx="3"
              style={{ fill: r.isTail ? "var(--baseline)" : BAR_COLORS[i % BAR_COLORS.length] }} />;
          })}
        </svg>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {rows.map((r, i) => (
            <span key={r.name} className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: r.isTail ? "var(--baseline)" : BAR_COLORS[i % BAR_COLORS.length] }} />
              {r.name.length > 34 ? r.name.slice(0, 33) + "…" : r.name}
              <span className="tabular" style={{ color: "var(--text-primary)" }}>{pct(r.share, 0)}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="review-table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Asset</th><th>Age</th><th style={{ textAlign: "right" }}>Spend</th>
              <th style={{ textAlign: "right" }}>Share</th><th style={{ textAlign: "right" }}>ROAS</th><th>Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="tabular" style={{ color: r.ageDays != null && r.ageDays >= 40 ? "var(--status-warning)" : "var(--text-secondary)" }}>
                  {r.isTail ? "mixed" : r.ageDays != null ? `${num(r.ageDays)} days live` : "—"}
                </td>
                <td className="tabular" style={{ textAlign: "right" }}>{inrCompact(r.spend)}</td>
                <td className="tabular" style={{ textAlign: "right" }}>{pct(r.share, 0)}</td>
                <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{r.roas != null ? `${ratio(r.roas)}×` : "—"}</td>
                <td style={{ color: "var(--text-secondary)" }}>{r.read}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
        The top {rows.filter((r) => !r.isTail).length} assets carry{" "}
        <strong className="tabular">{pct(topShare, 0)}</strong> of the month&rsquo;s delivery
        {oldest?.ageDays != null && oldest.ageDays >= 40 && (
          <> and the biggest of them has been live <strong className="tabular">{num(oldest.ageDays)} days</strong> —
          concentration plus age is the combination that bites, because if it fades there is nothing tested
          waiting to absorb the budget</>
        )}. Ad-level data is Meta only; Google reports at campaign level.
      </p>
    </div>
  );
}
