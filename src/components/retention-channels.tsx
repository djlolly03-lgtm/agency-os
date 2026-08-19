import { Lock, MessageCircle, Mail } from "lucide-react";
import type { RetentionMonth } from "@/lib/retention";
import { inrCompact, num, pct, ratio, monthLabel } from "@/lib/format";
import { Explain } from "@/components/explain";

/**
 * Retention channels — WhatsApp remarketing + email, the money made from
 * customers we already paid to acquire. Sits under the Channels act because
 * it's the third channel the Meta-vs-Google duel never shows. Renders an
 * awaiting-data state until the "8. Retention" tab lands in the
 * customer-data sheet (format in DATA-REQUESTS.md).
 */
export function RetentionChannels({ rows, paidRoas, selectedMonth }: {
  rows: RetentionMonth[];
  paidRoas: number | null;
  selectedMonth: string;          // YYYY-MM-01
}) {
  const row = rows.find((r) => r.month === selectedMonth) ?? rows[rows.length - 1] ?? null;

  if (!row) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-dashed px-5 py-4"
        style={{ borderColor: "var(--border-hairline)" }}>
        <Lock size={16} className="mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Retention channels — WhatsApp &amp; email · awaiting data
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            July&rsquo;s review deck showed WhatsApp remarketing turning ₹20.5k into ₹3.89L — an{" "}
            <strong style={{ color: "var(--text-secondary)" }}>18.97× ROAS</strong>, the best return in the
            account — but those numbers aren&rsquo;t in the data sheet, so the dashboard can&rsquo;t track them.
            One small monthly tab lights this up (format in DATA-REQUESTS.md).
          </p>
        </div>
      </div>
    );
  }

  const mLabel = monthLabel(row.month.slice(0, 7));
  const multiple = row.waRoas != null && paidRoas != null && paidRoas > 0 ? row.waRoas / paidRoas : null;

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Retention channels · {mLabel}</h3>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          revenue from customers already acquired
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* WhatsApp */}
        <Explain block math={{
          title: `WhatsApp remarketing · ${mLabel}`,
          steps: [
            { label: "Spend (tools + campaigns)", value: row.waSpend != null ? inrCompact(row.waSpend) : "—" },
            { label: "Revenue attributed", value: row.waRevenue != null ? inrCompact(row.waRevenue) : "—" },
            ...(row.waOrders != null ? [{ label: "Orders", value: num(row.waOrders) }] : []),
            ...(paidRoas != null ? [{ label: "Paid-ads ROAS, same period", value: `${ratio(paidRoas)}×` }] : []),
          ],
          formula: row.waRoas != null && row.waSpend != null && row.waRevenue != null
            ? `ROAS = ${inrCompact(row.waRevenue)} ÷ ${inrCompact(row.waSpend)} = ${ratio(row.waRoas)}×`
            : "ROAS = revenue ÷ spend",
          note: "Re-engaging existing customers and abandoned carts. High ROAS is expected here — the audience already knows the brand — but the scale of the gap vs paid is the point.",
          source: "Client-reported monthly retention tab · Sheets → Supabase",
        }}>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            <MessageCircle size={14} style={{ color: "var(--brand)" }} /> WhatsApp remarketing
          </div>
          <div className="mt-1 text-3xl font-bold tabular num-gradient">
            {row.waRoas != null ? `${ratio(row.waRoas)}×` : "—"}
          </div>
          <div className="mt-1 text-xs tabular" style={{ color: "var(--text-secondary)" }}>
            {row.waSpend != null ? inrCompact(row.waSpend) : "—"} spend ·{" "}
            {row.waRevenue != null ? inrCompact(row.waRevenue) : "—"} revenue
            {row.waOrders != null ? ` · ${num(row.waOrders)} orders` : ""}
          </div>
        </Explain>
        {/* Email */}
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border-hairline)" }}>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            <Mail size={14} style={{ color: "var(--brand-accent)" }} /> Email marketing
          </div>
          <div className="mt-1 text-3xl font-bold tabular">
            {row.emailOpenRate != null ? pct(row.emailOpenRate / 100) : "—"}
            <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--text-muted)" }}>open rate</span>
          </div>
          <div className="mt-1 text-xs tabular" style={{ color: "var(--text-secondary)" }}>
            {row.emailSent != null ? `${num(row.emailSent)} emails sent` : "—"}
          </div>
        </div>
      </div>
      {multiple != null && multiple > 1.5 && (
        <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
          Every rupee spent re-engaging existing customers returned{" "}
          <strong className="tabular" style={{ color: "var(--text-primary)" }}>{multiple.toFixed(1)}×</strong>{" "}
          what a paid-ads rupee did this period — the strongest argument on this page for growing the
          list (and the win-back queue above) instead of only buying new traffic.
        </p>
      )}
    </div>
  );
}
