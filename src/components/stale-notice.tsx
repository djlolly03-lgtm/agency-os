import Link from "next/link";
import { Clock } from "lucide-react";
import { dayLabel, monthLabel } from "@/lib/format";

/**
 * Says out loud when a section is running on older data than the period the
 * reader selected. The account has two clocks — ad platforms sync nightly,
 * the customer-side export is refreshed by hand — and without this the
 * customer numbers silently stay on last month while everything around them
 * moves, which reads as a bug rather than a data gap.
 */
export function StaleNotice({ selectedMonth, ordersThrough, shownMonth, slug }: {
  /** the month the reader picked, YYYY-MM-01 */
  selectedMonth: string;
  /** latest day present in the order export, YYYY-MM-DD */
  ordersThrough: string | null;
  /** the month this section is actually able to show, YYYY-MM-01 */
  shownMonth?: string | null;
  slug: string;
}) {
  // only speak up when the order data genuinely doesn't reach the selection
  if (!ordersThrough) return null;
  const selectedEnd = new Date(Date.UTC(
    Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (ordersThrough >= selectedEnd) return null;

  const behindDays = Math.round(
    (Date.parse(selectedEnd + "T00:00:00Z") - Date.parse(ordersThrough + "T00:00:00Z")) / 86400000);
  const differentMonth = shownMonth && shownMonth.slice(0, 7) !== selectedMonth.slice(0, 7);

  return (
    <div className="flex items-start gap-2.5 rounded-xl border px-4 py-2.5"
      style={{ borderColor: "var(--status-warning)", background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
      <Clock size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-warning)" }} />
      <p className="text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
        {differentMonth ? (
          <>
            Showing <strong style={{ color: "var(--text-primary)" }}>{monthLabel(shownMonth!.slice(0, 7))}</strong>, not{" "}
            {monthLabel(selectedMonth.slice(0, 7))} — customer data is only in through{" "}
            <strong style={{ color: "var(--text-primary)" }}>{dayLabel(ordersThrough)}</strong>.
          </>
        ) : (
          <>Customer data runs to <strong style={{ color: "var(--text-primary)" }}>{dayLabel(ordersThrough)}</strong>, {behindDays} days behind the ad data.</>
        )}{" "}
        The Shopify export and the monthly customer counts are refreshed by hand, so this section lags
        the rest of the page until they land.{" "}
        <Link href={`/${slug}/internal`} className="underline" style={{ color: "var(--brand)" }}>Update inputs →</Link>
      </p>
    </div>
  );
}
