import type { CreativeStatus } from "@/lib/queries";

/** Status chips: icon + label always (color never carries meaning alone). */
const STATUS: Record<CreativeStatus, { label: string; icon: string; color: string }> = {
  winner: { label: "Winner", icon: "▲", color: "var(--status-good)" },
  hidden_gem: { label: "Hidden gem", icon: "◆", color: "var(--series-1)" },
  average: { label: "Average", icon: "●", color: "var(--text-muted)" },
  fatiguing: { label: "Fatiguing", icon: "▼", color: "var(--status-serious)" },
  testing: { label: "Testing", icon: "◐", color: "var(--text-secondary)" },
  losing: { label: "Losing", icon: "✕", color: "var(--status-critical)" },
};

export function StatusChip({ status, muted }: { status: CreativeStatus; muted?: boolean }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: "var(--border-hairline)", color: muted ? "var(--text-muted)" : "var(--text-primary)" }}
    >
      <span aria-hidden style={{ color: s.color, fontSize: 9 }}>{s.icon}</span>
      {s.label}
    </span>
  );
}
