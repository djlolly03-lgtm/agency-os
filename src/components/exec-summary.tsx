import Link from "next/link";
import type { Insight } from "@/lib/insights";
import { TONE_COLOR } from "@/lib/insights";
import { ShareSummary } from "@/components/share-summary";

/** How many insights get promoted above the hero. Signals skips these. */
export const EXEC_SUMMARY_COUNT = 3;

const SEVERITY_BADGE: Record<Insight["severity"], string> = {
  critical: "Act now", watch: "Watch", fyi: "FYI",
};
const SEVERITY_COLOR: Record<Insight["severity"], string> = {
  critical: "var(--status-critical)",
  watch: "var(--status-warning)",
  fyi: "var(--text-muted)",
};

/**
 * The verdict, before the numbers. Each line is what happened AND what to do
 * about it — the action text comes straight off the insight, so the summary
 * and the Signals card can never drift apart.
 */
export function ExecSummary({ insights, periodLabel, clientName }: {
  insights: Insight[]; periodLabel: string; clientName: string;
}) {
  const top = insights.slice(0, EXEC_SUMMARY_COUNT);
  if (!top.length) return null;
  const critical = top.filter((i) => i.severity === "critical").length;

  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {periodLabel}, in {top.length === 1 ? "one line" : `${top.length} lines`}
          {critical > 0 && (
            <span style={{ color: "var(--status-critical)" }}> · {critical} need{critical === 1 ? "s" : ""} action</span>
          )}
        </span>
        <ShareSummary insights={top} periodLabel={periodLabel} clientName={clientName} />
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {top.map((ins, i) => {
          const color = TONE_COLOR[ins.tone];
          const sev = SEVERITY_COLOR[ins.severity];
          const inner = (
            <>
              <span className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                <span aria-hidden style={{ color }}>→</span>{" "}
                <strong className="tabular" style={{ color }}>{ins.metric}</strong>{" "}
                {ins.text}
              </span>
              {ins.action && (
                <span className="mt-1 flex items-start gap-1.5 text-[12px] font-medium leading-4">
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ background: `color-mix(in srgb, ${sev} 14%, transparent)`, color: sev }}>
                    {SEVERITY_BADGE[ins.severity]}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>{ins.action}</span>
                </span>
              )}
            </>
          );
          return ins.link ? (
            <Link key={i} href={ins.link.href} className="flex flex-col rounded-md transition-opacity hover:opacity-80">
              {inner}
            </Link>
          ) : (
            <div key={i} className="flex flex-col">{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
