"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const METRICS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "revenue", label: "Revenue (₹)", placeholder: "e.g. 1500000" },
  { key: "spend", label: "Spend (₹)", placeholder: "e.g. 400000" },
  { key: "orders", label: "Orders", placeholder: "e.g. 1300" },
];

export function GoalEditor({ slug, month, initial }: {
  slug: string; month: string; initial: Record<string, number>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(METRICS.map((m) => [m.key, initial[m.key] != null ? String(initial[m.key]) : ""])));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    for (const m of METRICS) {
      const v = Number(values[m.key]);
      if (values[m.key] !== "" && v >= 0) {
        await fetch(`/api/v1/clients/${slug}/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric: m.key, target: v, month }),
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
      {METRICS.map((m) => (
        <label key={m.key} className="flex flex-col gap-1 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>{m.label}</span>
          <input
            inputMode="numeric" placeholder={m.placeholder} value={values[m.key]}
            onChange={(e) => setValues((s) => ({ ...s, [m.key]: e.target.value.replace(/[^\d.]/g, "") }))}
            className="w-36 rounded-md border px-3 py-2 tabular"
            style={{ borderColor: "var(--border-hairline)", background: "var(--page)" }}
          />
        </label>
      ))}
      <button
        onClick={save} disabled={busy}
        className="rounded-md px-4 py-2 text-sm font-semibold text-white"
        style={{ background: "var(--brand)", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </button>
    </div>
  );
}
