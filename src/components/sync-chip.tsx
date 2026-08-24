import Link from "next/link";
import { dayLabel } from "@/lib/format";

/**
 * Live data-lineage chip: where the numbers come from and how fresh they are.
 *
 * The account runs on two clocks — ad platforms sync nightly, the Shopify
 * export and monthly customer counts are refreshed by hand. Showing a single
 * "data through" date let stale customer numbers pass as live ones, so when
 * the two diverge materially the chip says so and turns amber.
 */
export function SyncChip({ slug, lastDay, lastSync, ordersThrough }: {
  slug: string; lastDay: string; lastSync: string | null;
  /** latest day in the Shopify order export, when it's been ingested */
  ordersThrough?: string | null;
}) {
  const lagDays = ordersThrough
    ? Math.round((Date.parse(lastDay + "T00:00:00Z") - Date.parse(ordersThrough + "T00:00:00Z")) / 86400000)
    : 0;
  const stale = lagDays >= 7;
  const dot = stale ? "var(--status-warning)" : "var(--status-good)";

  return (
    <Link href={`/${slug}/internal`} className="chip transition-colors hover:brightness-110"
      title={[
        lastSync ? `Last sync ${lastSync}` : "Sync history",
        `Ad data through ${lastDay}`,
        ordersThrough ? `Customer data through ${ordersThrough}` : null,
      ].filter(Boolean).join(" · ")}>
      <span className="relative flex h-2 w-2" aria-hidden>
        {!stale && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: dot }} />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: dot }} />
      </span>
      <span style={{ color: "var(--text-secondary)" }}>
        {stale ? (
          <>
            Ads <strong style={{ color: "var(--text-primary)" }}>{dayLabel(lastDay)}</strong>
            {" · "}customers <strong style={{ color: "var(--status-warning)" }}>{dayLabel(ordersThrough!)}</strong>
          </>
        ) : (
          <>Sheets → Supabase · data through <strong style={{ color: "var(--text-primary)" }}>{dayLabel(lastDay)}</strong></>
        )}
      </span>
    </Link>
  );
}
