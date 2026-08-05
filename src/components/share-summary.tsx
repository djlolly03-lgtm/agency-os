"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import type { Insight } from "@/lib/insights";

/**
 * Turns the top insights into plain WhatsApp-ready text — one tap, no
 * retyping a number off the screen. Native share sheet on mobile (where
 * it's actually useful), clipboard copy everywhere else.
 */
export function ShareSummary({ insights, periodLabel, clientName }: {
  insights: Insight[]; periodLabel: string; clientName: string;
}) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  const buildText = () => {
    const lines = insights.slice(0, 3).map((i) => `• ${i.metric} — ${i.text}`);
    return [`${clientName} · ${periodLabel}`, ...lines].join("\n");
  };

  const handleShare = async () => {
    const text = buildText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, title: `${clientName} · ${periodLabel}` });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      // clipboard unavailable — silently no-op, nothing to recover from here
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-transform hover:scale-105"
      style={{ background: "var(--brand)", color: "#ffffff" }}
      title="Copy this summary as shareable text"
    >
      {state === "copied" ? <Check size={13} /> : <Share2 size={13} />}
      {state === "copied" ? "Copied" : "Share"}
    </button>
  );
}
