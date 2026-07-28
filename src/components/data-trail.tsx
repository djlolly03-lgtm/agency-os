import Link from "next/link";
import { Database } from "lucide-react";

/**
 * Wayfinding + data lineage in one strip: breadcrumb trail on the left,
 * "where this data comes from" on the right. Lives at the top of every
 * drill-down page so users always know where they are and what feeds it.
 */
export function DataTrail({ crumbs, source }: {
  crumbs: Array<{ label: string; href?: string }>;
  source: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden style={{ color: "var(--text-muted)" }}>/</span>}
            {c.href ? (
              <Link href={c.href} className="font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--text-secondary)" }}>
                {c.label}
              </Link>
            ) : (
              <span className="max-w-64 truncate font-semibold" style={{ color: "var(--text-primary)" }}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        <Database size={12} aria-hidden />
        {source}
      </span>
    </div>
  );
}
