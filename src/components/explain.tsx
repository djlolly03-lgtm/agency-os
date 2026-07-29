"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Database, X, HelpCircle } from "lucide-react";

export interface ExplainMath {
  title: string;
  steps: Array<{ label: string; value: string }>;
  formula: string;
  note?: string;
  /** where the inputs come from, e.g. "Meta daily export · Sheets → Supabase" */
  source: string;
  link?: { href: string; label: string };
}

/**
 * Universal explainability wrapper: wrap ANY stat, click it, and a panel
 * opens showing exactly how the number was arrived at — inputs, formula,
 * caveats, and the data source. Hover shows a "how?" affordance so
 * clickability is discoverable.
 */
export function Explain({ math, children, block }: {
  math: ExplainMath;
  children: React.ReactNode;
  /** render wrapper as block (full-width sections) */
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`group relative rounded-lg text-left transition-shadow ${block ? "block w-full" : "inline-block"}`}
        style={{ cursor: "pointer" }}
        aria-haspopup="dialog"
        title="Click for the math"
      >
        {children}
        <span
          className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: "var(--brand)", color: "#fff" }}
          aria-hidden
        >
          <HelpCircle size={13} strokeWidth={2.5} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ background: "rgba(8, 12, 10, 0.55)", backdropFilter: "blur(6px)" }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog" aria-label={math.title}
              className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6"
              initial={{ scale: 0.95, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.97, y: 8, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.21, 0.65, 0.36, 1] }}
              style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-lift)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--brand)" }}>
                    How we arrived at this
                  </div>
                  <h3 className="mt-0.5 text-base font-bold">{math.title}</h3>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close"
                  className="rounded-lg p-1.5 transition-colors hover:brightness-125"
                  style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                  <X size={16} />
                </button>
              </div>

              <dl className="flex flex-col">
                {math.steps.map((s, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4 py-2 text-sm"
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-hairline)" }}>
                    <dt style={{ color: "var(--text-secondary)" }}>{s.label}</dt>
                    <dd className="shrink-0 font-bold tabular" style={{ color: "var(--text-primary)" }}>{s.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-3 rounded-xl px-4 py-3 font-mono text-xs leading-6"
                style={{ background: "var(--page)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}>
                {math.formula}
              </div>

              {math.note && (
                <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{math.note}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                style={{ borderColor: "var(--border-hairline)" }}>
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <Database size={12} aria-hidden /> {math.source}
                </span>
                {math.link && (
                  <Link href={math.link.href} onClick={() => setOpen(false)}
                    className="text-xs font-semibold underline" style={{ color: "var(--brand)" }}>
                    {math.link.label}
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
