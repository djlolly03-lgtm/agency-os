"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { Insight, InsightSeverity } from "@/lib/insights";

const SEV: Record<InsightSeverity, { label: string; color: string }> = {
  critical: { label: "Act now", color: "var(--status-critical)" },
  watch: { label: "Watch", color: "var(--status-warning)" },
  fyi: { label: "Note", color: "var(--text-muted)" },
};

/**
 * Signals as a list, not a card grid.
 *
 * These were tiles with a 48px figure each, in seven different accent
 * colours, three to a row with a ragged last row. That treatment belongs to
 * a KPI — a number that means something on its own. A signal's content is
 * its SENTENCE; the figure only supports it ("4" and "10" at display size
 * say nothing without the line under them). Seven of them shouting at equal
 * volume also competed with the moves block above, which is the one thing
 * that should dominate.
 *
 * So: one card, one row per signal, metric inline and bold, severity as a
 * small marker rather than a pill, and the derivation one click down.
 */
export function InsightList({ insights, exclude = [] }: {
  insights: Insight[];
  /** categories already shown as moves at the top — never repeat them here */
  exclude?: string[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const rows = insights.filter((i) => !exclude.includes(i.category));
  if (!rows.length) return null;

  return (
    <div className="card overflow-hidden">
      {rows.map((ins, i) => {
        const isOpen = open === i;
        const sev = SEV[ins.severity];
        return (
          <div key={ins.category + i}
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-hairline)" }}>
            <button onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:brightness-105">
              {/* severity reads as a marker, not a badge competing for attention */}
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: sev.color }} />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--text-muted)" }}>
                    {ins.category}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: sev.color }}>
                    {sev.label}
                  </span>
                </div>
                {/* the sentence is the content; the figure rides inside it */}
                <p className="text-[13.5px] leading-5" style={{ color: "var(--text-primary)" }}>
                  <strong className="tabular">{ins.metric}</strong>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>{ins.text}</span>
                </p>
                {ins.action && (
                  <p className="text-[12px] leading-4" style={{ color: "var(--text-secondary)" }}>
                    <span aria-hidden style={{ color: sev.color }}>→</span> {ins.action}
                  </p>
                )}
              </div>

              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
                className="mt-1 shrink-0" style={{ color: "var(--text-muted)" }}>
                <ChevronDown size={15} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.21, 0.65, 0.36, 1] }}
                  style={{ overflow: "hidden" }}>
                  <div className="mx-5 mb-4 rounded-xl border p-4"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--page)" }}>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}>
                      How this was calculated
                    </div>
                    <dl className="flex flex-col">
                      {ins.math.steps.map((s, si) => (
                        <div key={si} className="flex items-baseline justify-between gap-4 py-1.5 text-xs"
                          style={{ borderTop: si === 0 ? "none" : "1px solid var(--border-hairline)" }}>
                          <dt style={{ color: "var(--text-secondary)" }}>{s.label}</dt>
                          <dd className="tabular shrink-0 font-semibold" style={{ color: "var(--text-primary)" }}>{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 rounded-lg px-3 py-2 font-mono text-[11px] leading-5"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}>
                      {ins.math.formula}
                    </div>
                    {ins.math.note && (
                      <p className="mt-2 text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>{ins.math.note}</p>
                    )}
                    {(ins.tracesTo || ins.costOfInaction) && (
                      <div className="mt-2 flex flex-col gap-0.5 text-[10.5px] leading-4" style={{ color: "var(--text-muted)" }}>
                        {ins.tracesTo && <span><strong>Traces to:</strong> {ins.tracesTo}</span>}
                        {ins.costOfInaction && <span><strong>Cost of doing nothing:</strong> {ins.costOfInaction}</span>}
                      </div>
                    )}
                    {ins.link && (
                      <Link href={ins.link.href}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline"
                        style={{ color: "var(--brand)" }}>
                        {ins.link.label}
                      </Link>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
