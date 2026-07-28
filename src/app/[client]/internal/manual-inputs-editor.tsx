"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "offline_revenue", label: "Offline revenue (₹)", hint: "from client" },
  { key: "total_revenue", label: "Store revenue (₹)", hint: "Shopify total" },
  { key: "total_orders", label: "Store orders", hint: "Shopify total" },
  { key: "ltv_fruits_veggies", label: "LTV — Fruits & Veggies (₹)", hint: "from client" },
  { key: "ltv_groceries", label: "LTV — Groceries (₹)", hint: "from client" },
];

/** Month-scoped editor for client-provided numbers (offline sales, LTV, Shopify totals). */
export function ManualInputsEditor({ slug, month, initial }: {
  slug: string; month: string; initial: Record<string, number>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, initial[f.key] != null ? String(initial[f.key]) : ""])));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    for (const f of FIELDS) {
      const v = Number(values[f.key]);
      if (values[f.key] !== "" && v >= 0 && v !== initial[f.key]) {
        await fetch(`/api/v1/clients/${slug}/manual-actuals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, metric: f.key, value: v }),
        });
      }
    }
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>{f.label}</span>
          <input
            inputMode="numeric" placeholder={f.hint} value={values[f.key]}
            onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))}
            className="w-40 rounded-md border px-3 py-2 tabular"
            style={{ borderColor: "var(--border-hairline)", background: "var(--page)" }}
          />
        </label>
      ))}
      <button
        onClick={save} disabled={busy}
        className="rounded-md px-4 py-2 text-sm font-semibold text-white"
        style={{ background: "var(--brand)", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save inputs"}
      </button>
    </div>
  );
}
