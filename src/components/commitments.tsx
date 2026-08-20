"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";

/**
 * Structured commitments — the review's forward plan as rows with an owner,
 * a date, and the number that proves delivery. Type + parser live in
 * src/lib/commitments.ts (shared with the server page).
 *
 * The loop: month M's review renders month M−1's commitments through
 * <CommitmentCheckins>, where each row gets stamped Done / Partial / Missed
 * (written back to M−1's row). Nothing quietly disappears.
 */
import { parseCommitments, type Commitment } from "@/lib/commitments";

async function save(slug: string, month: string, rows: Commitment[]) {
  await fetch(`/api/v1/clients/${slug}/review-notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ month, section: "commitments", body: JSON.stringify(rows) }),
  });
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  "": { label: "pending", bg: "var(--grid)", fg: "var(--text-muted)" },
  done: { label: "Done", bg: "var(--status-good)", fg: "#ffffff" },
  partial: { label: "Partial", bg: "var(--status-warning)", fg: "#101214" },
  missed: { label: "Missed", bg: "var(--status-critical)", fg: "#ffffff" },
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border-hairline)", borderRadius: 8,
  background: "var(--surface-1)", color: "var(--text-primary)",
  padding: "6px 8px", fontSize: 12, width: "100%", boxSizing: "border-box",
};

/** Current month: full CRUD over the commitment rows. */
export function CommitmentsEditor({ slug, month, initial }: {
  slug: string; month: string; initial: string;
}) {
  const [rows, setRows] = useState<Commitment[]>(() => parseCommitments(initial));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const persist = async (next: Commitment[]) => {
    setRows(next);
    setState("saving");
    try {
      await save(slug, month, next);
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch { setState("idle"); }
  };
  const update = (i: number, patch: Partial<Commitment>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setRows(next);   // save on blur, not per keystroke
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="no-print flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          # · commitment · owner · by · proves itself when
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {state === "saving" && <Loader2 size={11} className="inline animate-spin" />}
          {state === "saved" && <><Check size={11} className="inline" /> saved</>}
        </span>
      </div>

      {/* screen: editable rows */}
      <div className="no-print flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid items-center gap-1.5"
            style={{ gridTemplateColumns: "24px 1fr 130px 76px 220px 26px" }}>
            <span className="tabular text-xs font-bold" style={{ color: "var(--brand)" }}>C{i + 1}</span>
            <input style={inputStyle} defaultValue={r.text} placeholder="the commitment"
              onChange={(e) => update(i, { text: e.target.value })} onBlur={() => void persist(rows)} />
            <input style={inputStyle} defaultValue={r.owner} placeholder="owner"
              onChange={(e) => update(i, { owner: e.target.value })} onBlur={() => void persist(rows)} />
            <input style={inputStyle} defaultValue={r.due} placeholder="by"
              onChange={(e) => update(i, { due: e.target.value })} onBlur={() => void persist(rows)} />
            <input style={inputStyle} defaultValue={r.proof} placeholder="proves itself when…"
              onChange={(e) => update(i, { proof: e.target.value })} onBlur={() => void persist(rows)} />
            <button title="Remove" onClick={() => void persist(rows.filter((_, j) => j !== i))}
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border-hairline)" }}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button onClick={() => void persist([...rows, { text: "", owner: "", due: "", proof: "", status: "" }])}
          className="mt-1 flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--brand)", color: "#ffffff" }}>
          <Plus size={12} /> Add commitment
        </button>
      </div>

      {/* print: the same rows as a clean static table */}
      <table className="print-only review-table">
        <thead>
          <tr><th style={{ width: 30 }}>#</th><th>Commitment</th><th style={{ width: 110 }}>Owner</th>
            <th style={{ width: 60 }}>By</th><th style={{ width: 190 }}>Proves itself when</th></tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.text.trim()).map((r, i) => (
            <tr key={i}>
              <td className="tabular" style={{ fontWeight: 700 }}>C{i + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.text}</td>
              <td>{r.owner || "—"}</td>
              <td className="tabular">{r.due || "—"}</td>
              <td>{r.proof || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Previous month's commitments with a Done/Partial/Missed stamp on each —
 * click the stamp to cycle it; the status writes back to the PREVIOUS
 * month's row, so history keeps its verdicts.
 */
export function CommitmentCheckins({ slug, prevMonth, prevLabel, initial }: {
  slug: string; prevMonth: string; prevLabel: string; initial: string;
}) {
  const [rows, setRows] = useState<Commitment[]>(() => parseCommitments(initial));
  const withText = rows.filter((r) => r.text.trim());

  if (!withText.length) {
    return (
      <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        No commitments were logged for {prevLabel} — this section starts working the first
        month a plan is saved on page 05. Nothing to grade yet.
      </p>
    );
  }

  const cycle = async (i: number) => {
    const order: Commitment["status"][] = ["", "done", "partial", "missed"];
    const next = rows.map((r, j) => j === i
      ? { ...r, status: order[(order.indexOf(r.status) + 1) % order.length] }
      : r);
    setRows(next);
    try { await save(slug, prevMonth, next); } catch { /* keep local state */ }
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        if (!r.text.trim()) return null;
        const meta = STATUS_META[r.status];
        return (
          <div key={i} className="card flex items-center gap-4 px-4 py-3">
            <button onClick={() => void cycle(i)} title="Click to cycle: pending → done → partial → missed"
              className="shrink-0 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider"
              style={{ background: meta.bg, color: meta.fg, minWidth: 58 }}>
              {meta.label}
            </button>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{r.text}</span>
              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {r.owner || "unowned"}{r.due ? ` · by ${r.due}` : ""}{r.proof ? ` · proof: ${r.proof}` : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
