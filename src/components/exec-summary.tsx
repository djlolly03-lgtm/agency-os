"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { Insight } from "@/lib/insights";
import { ShareSummary } from "@/components/share-summary";

/** How many moves lead the console. The signals list below skips these. */
export const EXEC_SUMMARY_COUNT = 3;

/**
 * The priority actions, each openable into the full case behind it.
 *
 * A recommendation a buyer cannot audit is one they will not act on: "cap
 * this campaign" is worth nothing if the next question — says who? — costs
 * a page navigation to answer. So every move carries its own reasoning
 * inline: the inputs, the arithmetic, the caveat, the source it traces to,
 * and what ignoring it costs. The link out to the underlying data comes
 * last, for when someone wants to go further than the case.
 */
export function ExecSummary({ insights, periodLabel, clientName }: {
  insights: Insight[]; periodLabel: string; clientName: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const moves = insights.filter((i) => i.kind === "move" && i.action).slice(0, EXEC_SUMMARY_COUNT);
  if (!moves.length) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-1 pt-4">
        <div className="flex flex-col">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--status-critical)" }}>
            Most important to do
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {moves.length === 1 ? "One move" : `${moves.length} moves`} the numbers are asking for, in order ·
            open one for the full reasoning
          </span>
        </div>
        <ShareSummary insights={moves} periodLabel={periodLabel} clientName={clientName} />
      </div>

      <div className="flex flex-col p-2">
        {moves.map((m, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="py-1">
              <button onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
                className="flex w-full items-start gap-3.5 rounded-xl px-3.5 py-3 text-left transition-colors"
                style={{ background: isOpen ? "color-mix(in srgb, var(--brand) 9%, var(--surface-2))" : "var(--surface-2)" }}>
                <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                  style={{ background: "var(--brand)", color: "#ffffff" }}>
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold"
                    style={{ color: "var(--brand)" }}>
                    {isOpen ? "Hide the reasoning" : "Why we're saying this"}
                    <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
                      <ChevronDown size={12} />
                    </motion.span>
                  </span>
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.21, 0.65, 0.36, 1] }}>
                    <div className="mx-1 mb-1 mt-2 flex flex-col gap-3.5 rounded-xl border p-4"
                      style={{ borderColor: "var(--border-hairline)", background: "var(--page)" }}>

                      <Block label="The numbers behind it">
                        <table className="w-full text-xs">
                          <tbody>
                            {m.math.steps.map((s, si) => (
                              <tr key={si} style={{ borderTop: si === 0 ? "none" : "1px solid var(--border-hairline)" }}>
                                <td className="py-1.5 pr-4" style={{ color: "var(--text-secondary)" }}>{s.label}</td>
                                <td className="tabular whitespace-nowrap py-1.5 text-right font-bold"
                                  style={{ color: "var(--text-primary)" }}>{s.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Block>

                      <Block label="How the figure is worked out">
                        <div className="rounded-lg px-3 py-2 font-mono text-[11px] leading-5"
                          style={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}>
                          {m.math.formula}
                        </div>
                      </Block>

                      {m.math.note && (
                        <Block label="What to keep in mind">
                          <p className="text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>{m.math.note}</p>
                        </Block>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        {m.tracesTo && (
                          <Block label="Traces to">
                            <p className="text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>{m.tracesTo}</p>
                          </Block>
                        )}
                        {m.costOfInaction && (
                          <Block label="Cost of doing nothing">
                            <p className="text-[11.5px] leading-5" style={{ color: "var(--status-critical)" }}>{m.costOfInaction}</p>
                          </Block>
                        )}
                      </div>

                      {m.link && (
                        <Link href={m.link.href}
                          className="inline-flex w-fit items-center gap-1 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold"
                          style={{ background: "var(--brand)", color: "#ffffff" }}>
                          {m.link.label}
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
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
