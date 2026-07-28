"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MatchActions(props: {
  slug: string; adId: string; adName: string;
  mode: "confirm" | "pick";
  assetId?: string; filename?: string;
  assets?: Array<{ id: string; filename: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState("");

  const post = async (assetId: string, action: "link" | "unlink") => {
    setBusy(true);
    await fetch(`/api/v1/clients/${props.slug}/creative-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adId: props.adId, assetId, action }),
    });
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: "var(--border-hairline)" }}>
      <span className="min-w-0 flex-1 truncate">{props.adName}</span>
      {props.mode === "confirm" ? (
        <span className="flex items-center gap-2">
          <span style={{ color: "var(--text-muted)" }}>→ {props.filename}</span>
          <button disabled={busy} onClick={() => post(props.assetId!, "link")}
            className="rounded border px-2 py-1 font-medium"
            style={{ borderColor: "var(--border-hairline)", color: "var(--delta-good)" }}>
            Confirm
          </button>
          <button disabled={busy} onClick={() => post(props.assetId!, "unlink")}
            className="rounded border px-2 py-1"
            style={{ borderColor: "var(--border-hairline)", color: "var(--status-critical)" }}>
            Reject
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <select value={picked} onChange={(e) => setPicked(e.target.value)}
            className="max-w-56 rounded border px-2 py-1"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            <option value="">— pick asset —</option>
            {(props.assets ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.filename}</option>
            ))}
          </select>
          <button disabled={busy || !picked} onClick={() => post(picked, "link")}
            className="rounded border px-2 py-1 font-medium"
            style={{ borderColor: "var(--border-hairline)" }}>
            Link
          </button>
        </span>
      )}
    </div>
  );
}
