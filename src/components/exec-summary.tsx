import Link from "next/link";
import type { Insight } from "@/lib/insights";
import { TONE_COLOR } from "@/lib/insights";
import { ShareSummary } from "@/components/share-summary";

/**
 * Three lines before the hero — what happened, what to do. Reuses the same
 * insights computed for the Signals act; just promotes the top 3 above the
 * fold instead of making a client scroll past the hero, Customer Engine and
 * Cohorts before hitting anything resembling a verdict.
 */
export function ExecSummary({ insights, periodLabel, clientName }: {
  insights: Insight[]; periodLabel: string; clientName: string;
}) {
  const top = insights.slice(0, 3);
  if (!top.length) return null;

  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {periodLabel}, in three lines
        </span>
        <ShareSummary insights={top} periodLabel={periodLabel} clientName={clientName} />
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {top.map((ins, i) => {
          const inner = (
            <span className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
              <span aria-hidden style={{ color: TONE_COLOR[ins.tone] }}>→</span>{" "}
              <strong className="tabular" style={{ color: TONE_COLOR[ins.tone] }}>{ins.metric}</strong>{" "}
              {ins.text}
            </span>
          );
          return ins.link ? (
            <Link key={i} href={ins.link.href} className="rounded-md transition-opacity hover:opacity-80">
              {inner}
            </Link>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
