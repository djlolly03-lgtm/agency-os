import { Explain } from "@/components/explain";
import { SpotlightStage } from "@/components/hero-cinema";
import { inrCompact } from "@/lib/format";

export interface BridgeMonth {
  label: string;               // "Jun ’26"
  meta: number;                // paid revenue
  google: number;
  organic: number;             // store total − paid (>= 0 expected)
  total: number;               // store total
}

/**
 * 03 · Money flow — the month-to-month revenue bridge. Where the change
 * actually came from, decomposed by source: Meta, Google, organic. Every
 * step is real (no illustrative splits) — the columns sum exactly.
 */
export function RevenueBridge({ prev, cur }: { prev: BridgeMonth; cur: BridgeMonth }) {
  const steps = [
    { key: "meta", label: "Meta", delta: cur.meta - prev.meta },
    { key: "google", label: "Google", delta: cur.google - prev.google },
    { key: "organic", label: "Organic", delta: cur.organic - prev.organic },
  ];
  const cols: Array<{ label: string; from: number; to: number; kind: "total" | "up" | "down"; value: number }> = [];
  cols.push({ label: `${prev.label} total`, from: 0, to: prev.total, kind: "total", value: prev.total });
  let run = prev.total;
  for (const s of steps) {
    cols.push({
      label: s.label, from: run, to: run + s.delta,
      kind: s.delta >= 0 ? "up" : "down", value: s.delta,
    });
    run += s.delta;
  }
  cols.push({ label: `${cur.label} total`, from: 0, to: cur.total, kind: "total", value: cur.total });

  const maxY = Math.max(...cols.map((c) => Math.max(c.from, c.to))) * 1.14;
  const W = 1180, H = 300, PAD = 24, LABEL_H = 26, TOP = 8;
  const plotH = H - LABEL_H - TOP;
  const slot = (W - PAD * 2) / cols.length;
  const bw = Math.min(slot * 0.56, 120);
  const y = (v: number) => TOP + (1 - v / maxY) * plotH;

  const biggestUp = [...steps].sort((a, b) => b.delta - a.delta)[0];
  const biggestDown = [...steps].sort((a, b) => a.delta - b.delta)[0];
  const netDelta = cur.total - prev.total;

  return (
    <SpotlightStage>
      <div className="canvas-dark p-5 md:p-6">
        <Explain block math={{
          title: `Revenue bridge · ${prev.label} → ${cur.label}`,
          steps: [
            { label: `${prev.label} store total`, value: inrCompact(prev.total) },
            ...steps.map((s) => ({
              label: `Δ ${s.label} (${inrCompact(prev[s.key as "meta" | "google" | "organic"])} → ${inrCompact(cur[s.key as "meta" | "google" | "organic"])})`,
              value: `${s.delta >= 0 ? "+" : "−"}${inrCompact(Math.abs(s.delta))}`,
            })),
            { label: `${cur.label} store total`, value: inrCompact(cur.total) },
          ],
          formula: `${inrCompact(prev.total)} ${steps.map((s) => `${s.delta >= 0 ? "+" : "−"} ${inrCompact(Math.abs(s.delta))}`).join(" ")} = ${inrCompact(cur.total)}`,
          note: "Organic = store total − platform-attributed paid revenue. The steps sum exactly — nothing is illustrative.",
          source: "Dashboard tab (Shopify) + platform exports · Sheets → Supabase",
        }}>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img"
              aria-label={`Revenue bridge from ${prev.label} to ${cur.label}`}>
              <defs>
                <linearGradient id="rb-up" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#149b85" />
                  <stop offset="100%" stopColor="#4be3c3" />
                </linearGradient>
                <linearGradient id="rb-down" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffb267" />
                  <stop offset="100%" stopColor="#d2611f" />
                </linearGradient>
              </defs>
              {cols.map((c, i) => {
                const xPos = PAD + slot * i + (slot - bw) / 2;
                const top = Math.min(y(c.from), y(c.to));
                const h = Math.max(Math.abs(y(c.from) - y(c.to)), 3);
                const fill = c.kind === "total" ? "#f4efe6" : c.kind === "up" ? "url(#rb-up)" : "url(#rb-down)";
                const valText = c.kind === "total"
                  ? inrCompact(c.value)
                  : `${c.value >= 0 ? "+" : "−"}${inrCompact(Math.abs(c.value))}`;
                return (
                  <g key={i}>
                    {/* connector to the next column */}
                    {i < cols.length - 1 && (
                      <line x1={xPos + bw} x2={PAD + slot * (i + 1) + (slot - bw) / 2}
                        y1={y(c.to)} y2={y(c.to)} stroke="var(--baseline)" strokeDasharray="3 4" />
                    )}
                    <rect x={xPos} y={top} width={bw} height={h} rx="8" fill={fill}
                      className="growth-bar" style={{ animationDelay: `${i * 0.08}s` }} />
                    <text x={xPos + bw / 2} y={top - 8} textAnchor="middle" fontSize="12.5"
                      fontWeight="800" className="tabular"
                      fill={c.kind === "total" ? "var(--text-primary)" : c.kind === "up" ? "#4be3c3" : "#ffb267"}>
                      {valText}
                    </text>
                    <text x={xPos + bw / 2} y={H - 8} textAnchor="middle" fontSize="11.5"
                      fill="var(--text-secondary)">{c.label}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Explain>
        <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--brand)" }}>The story:</strong>{" "}
          {netDelta >= 0 ? `${inrCompact(netDelta)} of net growth` : `a ${inrCompact(Math.abs(netDelta))} net dip`} from {prev.label} to {cur.label}
          {biggestUp.delta > 0 ? ` — ${biggestUp.label} added the most (+${inrCompact(biggestUp.delta)})` : ""}
          {biggestDown.delta < 0 ? `${biggestUp.delta > 0 ? "," : " —"} while ${biggestDown.label} gave back ${inrCompact(Math.abs(biggestDown.delta))}` : ""}.
          {" "}Every step is measured, not modelled.
        </p>
      </div>
    </SpotlightStage>
  );
}
