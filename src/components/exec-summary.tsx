import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Insight } from "@/lib/insights";
import { ShareSummary } from "@/components/share-summary";

/** How many moves lead the console. Signals below skip these. */
export const EXEC_SUMMARY_COUNT = 3;

/**
 * The top of the console: what to DO, not what happened.
 *
 * It shows `kind: "move"` insights only — each names a budget, schedule,
 * creative or audience to change, and carries the money at stake. Status
 * readings (LTV:CAC, goal attainment, CPA drift) are true and useful but
 * they are not instructions, so they wait in Signals below. Sorting purely
 * by severity used to float them above the moves, which turned the first
 * thing you read back into a status report.
 */
export function ExecSummary({ insights, periodLabel, clientName }: {
  insights: Insight[]; periodLabel: string; clientName: string;
}) {
  const moves = insights.filter((i) => i.kind === "move" && i.action).slice(0, EXEC_SUMMARY_COUNT);
  if (!moves.length) return null;

  return (
    <div className="card px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--status-critical)" }}>
            Most important to do
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {moves.length === 1 ? "One move" : `${moves.length} moves`} the numbers are asking for, in order
          </span>
        </div>
        <ShareSummary insights={moves} periodLabel={periodLabel} clientName={clientName} />
      </div>

      <div className="flex flex-col gap-2">
        {moves.map((m, i) => {
          const body = (
            <div className="flex items-start gap-3.5 rounded-xl px-3.5 py-3 transition-colors"
              style={{ background: "var(--surface-2)" }}>
              <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                style={{ background: "var(--brand)", color: "#ffffff" }}>
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {/* the instruction leads — the evidence supports it */}
                <span className="text-[14px] font-bold leading-5" style={{ color: "var(--text-primary)" }}>
                  {m.action}
                </span>
                <span className="text-[12px] leading-5" style={{ color: "var(--text-secondary)" }}>
                  <strong className="tabular" style={{ color: "var(--text-primary)" }}>{m.metric}</strong>{" "}
                  {m.text}
                </span>
                {m.costOfInaction && (
                  <span className="text-[11.5px] font-semibold leading-4" style={{ color: "var(--status-critical)" }}>
                    Leaving it: {m.costOfInaction}
                  </span>
                )}
              </div>
              {m.link && (
                <ArrowRight size={14} className="mt-1 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden />
              )}
            </div>
          );
          return m.link ? (
            <Link key={i} href={m.link.href} className="rounded-xl hover:brightness-105">{body}</Link>
          ) : (
            <div key={i}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
