"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Primary nav — floating glass pill with a solid active segment. */
export function Nav({ slug, items }: {
  slug: string;
  /** `also` lets one tab own several routes — Library covers creatives
   *  and campaigns, so drilling into either keeps the tab lit. */
  items: Array<{ href: string; label: string; also?: string[] }>;
}) {
  const pathname = usePathname();
  return (
    <nav className="glass-pill max-w-full overflow-x-auto text-sm" style={{ scrollbarWidth: "none" }}>
      {items.map((n) => {
        const full = `/${slug}${n.href}`;
        const owned = [n.href, ...(n.also ?? [])];
        const active = n.href === ""
          ? pathname === `/${slug}`
          : owned.some((h) => pathname.startsWith(`/${slug}${h}`));
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
