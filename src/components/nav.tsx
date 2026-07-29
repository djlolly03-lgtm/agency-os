"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Primary nav — floating glass pill with a solid active segment. */
export function Nav({ slug, items }: {
  slug: string;
  items: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  return (
    <nav className="glass-pill max-w-full overflow-x-auto text-sm" style={{ scrollbarWidth: "none" }}>
      {items.map((n) => {
        const full = `/${slug}${n.href}`;
        const active = n.href === ""
          ? pathname === `/${slug}`
          : pathname.startsWith(full);
        return (
          <Link
            key={n.href}
            href={full}
            aria-current={active ? "page" : undefined}
            className="whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium transition-colors"
            style={active
              ? { background: "var(--brand)", color: "#ffffff" }
              : { color: "var(--text-secondary)" }}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
