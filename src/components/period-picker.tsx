import Link from "next/link";
import type { Period } from "@/lib/periods";
import { shortMonth } from "@/lib/periods";

/**
 * Time controls: month chips (the atom) + period chips (quarters, halves,
 * last-6, years, all-time). One selected key across both groups.
 */
export function PeriodPicker({ months, periods, selectedKey, basePath, center }: {
  months: string[];             // YYYY-MM-01, any order
  periods: Period[];
  selectedKey: string;          // "2026-07" | "2026-q2" | "all" | ...
  basePath: string;
  center?: boolean;
}) {
  const ordered = [...months].sort();
  const chip = (href: string, label: string, active: boolean, accent?: boolean) => (
    <Link key={href} href={href}
      className="whitespace-nowrap rounded-full border px-2.5 py-1 transition-colors"
      style={{
        borderColor: active ? "transparent" : "var(--border-hairline)",
        background: active ? (accent ? "var(--brand-accent)" : "var(--brand)") : "transparent",
        color: active ? "#ffffff" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
      }}>
      {label}
    </Link>
  );
  const side = center ? "justify-center" : "justify-end";
  return (
    <div className={`flex flex-col ${center ? "items-center" : "items-end"} gap-1.5 text-xs`}>
      <div className={`flex flex-wrap ${side} gap-1`}>
        {ordered.map((m) =>
          chip(`${basePath}?month=${m.slice(0, 7)}`, shortMonth(m), selectedKey === m.slice(0, 7)))}
      </div>
      <div className={`flex flex-wrap items-center ${side} gap-1`}>
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Zoom out
        </span>
        {periods.map((p) =>
          chip(`${basePath}?period=${p.key}`, p.label, selectedKey === p.key, true))}
      </div>
    </div>
  );
}
