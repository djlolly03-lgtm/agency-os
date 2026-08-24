"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import type { WinbackSegment } from "@/lib/shopify";
import { inr, inrCompact, num } from "@/lib/format";

/**
 * Win-back queue — three campaignable segments as clickable cards; opening
 * one reveals how the number was derived, why that treatment, and a sample
 * of the actual queue.
 *
 * The derivation panel is the point. A count nobody can audit is a number
 * to argue with; a count with its filter and its steps on screen is a list
 * to work. Keyboard-operable (Enter/Space), which the design prototype
 * left as a to-do.
 */
export function WinbackQueue({ segments, slug }: { segments: WinbackSegment[]; slug: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const live = segments.filter((s) => s.count > 0);
  if (!live.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {live.map((s, i) => {
          const isOpen = open === i;
          return (
            <div
              key={s.key}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? null : i); }
              }}
              className="card flex cursor-pointer flex-col gap-1.5 px-4 py-3.5 transition-transform"
              style={{
                background: isOpen ? "color-mix(in srgb, var(--brand) 10%, var(--surface-1))" : undefined,
                borderColor: isOpen ? "var(--brand)" : undefined,
                transform: isOpen ? "translateY(-2px)" : undefined,
              }}
            >
              <div className="tabular text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>
                {num(s.count)}
              </div>
              <div className="text-[12px] font-bold leading-4" style={{ color: "var(--text-primary)" }}>{s.label}</div>
              <div className="tabular text-[11px]" style={{ color: "var(--text-muted)" }}>
                {inrCompact(s.historicValue)} lifetime spend
              </div>
              <div className="mt-1 text-[11.5px] leading-4" style={{ color: "var(--text-secondary)" }}>
                {s.treatment}
              </div>
              <span className="no-print mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold" style={{ color: "var(--brand)" }}>
                How we got this list <ChevronRight size={11} style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
              </span>
            </div>
          );
        })}
      </div>

      {open != null && live[open] && (
        <DerivationPanel s={live[open]} slug={slug} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function DerivationPanel({ s, slug, onClose }: { s: WinbackSegment; slug: string; onClose: () => void }) {
  return (
    <div className="card flex flex-col gap-4 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            How we got this list
          </span>
          <span className="text-[15px] font-bold">{s.label} · {num(s.count)} customers</span>
        </div>
        <button onClick={onClose}
          className="no-print flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold"
          style={{ border: "1px solid var(--border-hairline)", color: "var(--text-secondary)" }}>
          <X size={11} /> Close
        </button>
      </div>

      <div className="rounded-lg px-3.5 py-2.5 font-mono text-[11px] leading-5"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}>
        {s.rule}
      </div>

      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[12px] leading-5" style={{ color: "var(--text-secondary)" }}>
        {s.derivation.map((d, i) => <li key={i}>{d}</li>)}
      </ol>

      <div className="rounded-xl px-4 py-3" style={{ background: "color-mix(in srgb, var(--brand) 8%, transparent)" }}>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--brand)" }}>
          Why this treatment
        </div>
        <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-primary)" }}>{s.rationale}</p>
      </div>

      {s.sample.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="review-table" style={{ minWidth: 460 }}>
            <thead>
              <tr><th>Customer</th><th>Last order</th><th style={{ textAlign: "right" }}>Orders</th>
                <th style={{ textAlign: "right" }}>Lifetime</th></tr>
            </thead>
            <tbody>
              {s.sample.map((c) => (
                <tr key={c.email}>
                  <td style={{ fontWeight: 600 }}>{c.name || c.email}</td>
                  <td className="tabular">{c.lastOrder}</td>
                  <td className="tabular" style={{ textAlign: "right" }}>{num(c.orders)}</td>
                  <td className="tabular" style={{ textAlign: "right", fontWeight: 700 }}>{inr(c.lifetimeSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.more > 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {num(s.more)} more in this queue —{" "}
          <Link href={`/${slug}/internal#winback`} className="underline" style={{ color: "var(--brand)" }}>
            full list with contact details on the internal page →
          </Link>
        </p>
      )}
    </div>
  );
}
