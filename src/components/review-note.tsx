"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * One narrative section of the monthly review. Renders as plain prose (so the
 * printed PDF looks written, not like a form), and turns into a textarea when
 * clicked. Saves on blur — no save button to forget.
 *
 * Bullets: any line starting with "-" or "•" renders as a list item, so the
 * team can paste the same bullet style they use in the deck.
 */
export function ReviewNote({ slug, month, section, label, hint, initial }: {
  slug: string; month: string; section: string;
  label: string; hint: string; initial: string;
}) {
  const [body, setBody] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const save = async (next: string) => {
    setEditing(false);
    if (next === initial && state === "idle") return;
    setState("saving");
    try {
      await fetch(`/api/v1/clients/${slug}/review-notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, section, body: next }),
      });
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");   // leave the text in the box so nothing is lost
    }
  };

  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•]/.test(l)).map((l) => l.replace(/^[-•]\s*/, ""));
  const paras = lines.filter((l) => !/^[-•]/.test(l));

  return (
    <section className="review-block">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="review-h3">{label}</h3>
        <span className="no-print text-[10px]" style={{ color: "var(--text-muted)" }}>
          {state === "saving" && <Loader2 size={11} className="inline animate-spin" />}
          {state === "saved" && <><Check size={11} className="inline" /> saved</>}
          {state === "idle" && !editing && (body ? "click to edit" : "")}
        </span>
      </div>

      {editing ? (
        <textarea
          autoFocus
          defaultValue={body}
          onBlur={(e) => { setBody(e.target.value); void save(e.target.value); }}
          rows={Math.max(5, lines.length + 2)}
          placeholder={hint}
          className="w-full rounded-lg border p-3 text-sm leading-6"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
      ) : body ? (
        <div onClick={() => setEditing(true)} className="cursor-text">
          {bullets.length > 0 && (
            <ul className="ml-4 list-disc text-sm leading-6" style={{ color: "var(--text-primary)" }}>
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          {paras.map((p, i) => (
            <p key={i} className="text-sm leading-6" style={{ color: "var(--text-primary)" }}>{p}</p>
          ))}
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="no-print w-full rounded-lg border border-dashed px-3 py-4 text-left text-xs"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}>
          {hint} <span style={{ color: "var(--brand)" }}>Click to write.</span>
        </button>
      )}
    </section>
  );
}
