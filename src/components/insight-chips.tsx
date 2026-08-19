"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Flame, TrendingDown, TrendingUp, Zap, Gem, Target, CheckCircle2, ChevronDown, Sun, Sprout, Users,
} from "lucide-react";
import type { Insight, InsightIcon, InsightSeverity } from "@/lib/insights";
import { TONE_COLOR } from "@/lib/insights";

const ICONS: Record<InsightIcon, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  flame: Flame, "trend-down": TrendingDown, "trend-up": TrendingUp,
  zap: Zap, gem: Gem, target: Target, check: CheckCircle2, sun: Sun, leaf: Sprout, users: Users,
};

// short badge text for the card header — the engine's SEVERITY_LABEL strings
// ("Needs action" etc.) are meant for a roomier future surface; these are
// tuned to fit a small pill next to an already-busy icon + category row.
const SEVERITY_BADGE: Record<InsightSeverity, string> = { critical: "Act now", watch: "Watch", fyi: "FYI" };
const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  critical: "var(--status-critical)",
  watch: "var(--status-warning)",
  fyi: "var(--text-muted)",
};

/**
 * Insight cards — interpreted observations as structured stat cards:
 * tinted icon tile · uppercase kicker · big metric · one-liner.
 * Expands to the full derivation (inputs → formula → link).
 */
export function InsightChips({ insights, skip = 0 }: {
  insights: Insight[];
  /** how many leading insights the exec summary already showed — don't repeat them */
  skip?: number;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const rest = insights.slice(skip);
  if (!rest.length) return null;
  return (
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rest.map((ins, idx) => {
        const isOpen = open === idx;
        const color = TONE_COLOR[ins.tone];
        const sevColor = SEVERITY_COLOR[ins.severity];
        const Icon = ICONS[ins.icon];
        return (
          <div key={idx} className="card card-lift overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : idx)}
              aria-expanded={isOpen}
              className="block w-full p-5 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)" }}>
                  {ins.category}
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: `color-mix(in srgb, ${sevColor} 14%, transparent)`, color: sevColor }}>
                  {SEVERITY_BADGE[ins.severity]}
                </span>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
                  style={{ color: "var(--text-muted)" }}>
                  <ChevronDown size={16} />
                </motion.span>
              </div>
              <div className="mt-3 text-4xl font-bold tabular" style={{ color, letterSpacing: "-0.02em" }}>
                {ins.metric}
              </div>
              <p className="mt-1.5 text-[13px] leading-5" style={{ color: "var(--text-secondary)" }}>
                {ins.text}
              </p>
              {ins.action && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium leading-4"
                  style={{ background: `color-mix(in srgb, ${sevColor} 10%, transparent)`, color: "var(--text-primary)" }}>
                  <span aria-hidden style={{ color: sevColor }}>→</span>
                  {ins.action}
                </p>
              )}
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.21, 0.65, 0.36, 1] }}
                >
                  <div className="mx-4 mb-4 rounded-xl border p-4"
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
                          <dd className="shrink-0 font-semibold tabular" style={{ color: "var(--text-primary)" }}>{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 rounded-lg px-3 py-2 font-mono text-[11px] leading-5"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}>
                      {ins.math.formula}
                    </div>
                    {ins.math.note && (
                      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{ins.math.note}</p>
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
