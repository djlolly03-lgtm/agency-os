import { ChevronDown } from "lucide-react";

/**
 * Progressive disclosure for reference-grade blocks — the funnel, the season
 * grid, the exploration charts. They're genuinely useful when someone goes
 * looking, and they were costing a full screen each in the default scroll.
 *
 * Native <details> on purpose: no client JS, no hydration cost, works with
 * ctrl-F and print-to-PDF (browsers expand open details when printing).
 * `teaser` is the one line worth seeing without opening it.
 */
export function Collapsible({ title, teaser, children, defaultOpen = false }: {
  title: string;
  teaser?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="card group overflow-hidden">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5"
        style={{ color: "var(--text-primary)" }}
      >
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">{title}</span>
          {teaser && (
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{teaser}</span>
          )}
        </span>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180"
          style={{ color: "var(--text-muted)" }} aria-hidden />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
