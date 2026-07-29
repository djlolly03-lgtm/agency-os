import Link from "next/link";
import { Lock, UserPlus, Repeat } from "lucide-react";
import type { CustomerMonth } from "@/lib/queries";
import { inr, inrCompact, num, pct, monthLabel, ratio } from "@/lib/format";
import { AnimatedNumber } from "@/components/motion";

/**
 * Customer Engine — what a customer actually costs and is actually worth.
 * Derived from client-provided monthly new/returning counts:
 *   CAC(new) = paid spend ÷ new customers
 *   LTV      = AOV ÷ (1 − repeat rate)   (geometric repeat model)
 *   LTV:CAC  = the agency's report card
 * Months without client data render as unlit coverage dots that link
 * straight to the Internal editor — the dashboard asks for its own data.
 */
export function CustomerEconomics({ months, slug }: { months: CustomerMonth[]; slug: string }) {
  const withData = months.filter((m) => m.hasData && m.ltvCac != null);
  const latest = withData[withData.length - 1];
  const prev = withData[withData.length - 2];
  const maxCustomers = Math.max(1, ...withData.map((m) => (m.newCustomers ?? 0) + (m.returningCustomers ?? 0)));

  return (
    <div className="canvas-dark p-6">
      {!latest ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No customer data yet — add monthly new/returning customer counts on the{" "}
          <Link href={`/${slug}/internal`} className="underline" style={{ color: "var(--brand)" }}>Internal page</Link>.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1.6fr]">
          {/* ===== left: the verdict ===== */}
          <div>
            <div className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              LTV : CAC · {monthLabel(latest.month.slice(0, 7))}
            </div>
            <div className="hero-number num-gradient tabular mt-1">
              <AnimatedNumber value={latest.ltvCac!} format="ratio" />
              <span className="text-2xl font-semibold">×</span>
            </div>
            <p className="mt-2 max-w-xs text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
              Every <strong style={{ color: "var(--text-primary)" }}>₹1</strong> spent acquiring a customer buys{" "}
              <strong style={{ color: "var(--text-primary)" }}>{inr(latest.ltvCac!)}</strong> of expected lifetime revenue.
            </p>

            {/* CAC vs LTV bars */}
            <div className="mt-5 flex flex-col gap-2.5">
              {[
                { label: "CAC · new customer", value: latest.cacNew!, color: "var(--brand-accent)" },
                { label: "Derived LTV", value: latest.ltv!, color: "var(--brand)" },
              ].map((b) => (
                <div key={b.label}>
                  <div className="mb-1 flex items-baseline justify-between text-[11px]">
                    <span style={{ color: "var(--text-muted)" }}>{b.label}</span>
                    <span className="font-bold tabular" style={{ color: "var(--text-primary)" }}>{inr(b.value)}</span>
                  </div>
                  <div className="h-4 w-full rounded-md" style={{ background: "var(--grid)" }}>
                    <div className="seg-grow h-full rounded-md"
                      style={{ ["--w" as string]: `${(100 * b.value) / latest.ltv!}%`, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* per-month stat chips */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {([
                ["New customers", num(latest.newCustomers!), prev ? (latest.newCustomers! / prev.newCustomers!) - 1 : null],
                ["Repeat rate", pct(latest.repeatRate!), prev ? latest.repeatRate! - prev.repeatRate! : null],
                ["CAC (new)", inr(latest.cacNew!), null],
                ["AOV blended", inr(latest.aov!), null],
              ] as Array<[string, string, number | null]>).map(([label, value, delta]) => (
                <div key={label}>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
                  <div className="text-lg font-bold tabular" style={{ color: "var(--text-primary)" }}>
                    {value}
                    {delta != null && Math.abs(delta) > 0.004 && (
                      <span className="ml-1.5 text-[11px] font-bold"
                        style={{ color: delta > 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                        {delta > 0 ? "▲" : "▼"}{typeof delta === "number" && Math.abs(delta) < 1 ? `${Math.abs(delta * 100).toFixed(0)}${label === "Repeat rate" ? "pt" : "%"}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ===== right: new vs repeat mix + locked splits + coverage ===== */}
          <div className="flex flex-col gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  New vs returning customers
                </span>
                <span className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center gap-1"><UserPlus size={11} /> new</span>
                  <span className="flex items-center gap-1"><Repeat size={11} /> returning</span>
                </span>
              </div>
              <div className="flex items-end gap-3" style={{ height: 150 }}>
                {withData.map((m) => {
                  const total = (m.newCustomers ?? 0) + (m.returningCustomers ?? 0);
                  return (
                    <Link key={m.month} href={`/${slug}/monthly`}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${monthLabel(m.month.slice(0, 7))} · ${num(m.newCustomers!)} new + ${num(m.returningCustomers!)} returning · repeat ${pct(m.repeatRate!)}`}>
                      <span className="text-[11px] font-bold tabular" style={{ color: "var(--text-secondary)" }}>{num(total)}</span>
                      <div className="flex w-full max-w-16 flex-col overflow-hidden rounded-lg transition-transform group-hover:scale-105"
                        style={{ height: `${(100 * total) / maxCustomers}%`, minHeight: 34 }}>
                        <div style={{ flex: m.returningCustomers ?? 0, background: "var(--brand-accent)", opacity: 0.9 }} />
                        <div style={{ flex: m.newCustomers ?? 0, background: "var(--brand)" }} />
                      </div>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
                        {monthLabel(m.month.slice(0, 7)).split(" ")[0]}
                      </span>
                    </Link>
                  );
                })}
                {withData.length <= 2 && (
                  <div className="flex h-full flex-[2] items-center justify-center rounded-xl border border-dashed p-4 text-center"
                    style={{ borderColor: "var(--border-hairline)" }}>
                    <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                      {months.length - withData.length} more months unlock when the client shares
                      monthly customer counts —{" "}
                      <Link href={`/${slug}/internal`} className="underline" style={{ color: "var(--brand)" }}>add them here</Link>.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* locked deeper splits — what better data unlocks */}
            <div className="grid grid-cols-2 gap-3">
              {["New-customer AOV", "Repeat-customer AOV"].map((label) => (
                <div key={label} className="flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3"
                  style={{ borderColor: "var(--border-hairline)" }}>
                  <Lock size={14} style={{ color: "var(--text-muted)" }} />
                  <div>
                    <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{label}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      unlocks with the Shopify customer report
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* data coverage strip — each dot is a month; unlit dots link to the editor */}
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Customer-data coverage · {withData.length}/{months.length} months
              </div>
              <div className="flex flex-wrap gap-1.5">
                {months.map((m) => (
                  <Link key={m.month} href={`/${slug}/internal?month=${m.month.slice(0, 7)}`}
                    title={`${monthLabel(m.month.slice(0, 7))} — ${m.hasData ? "data present" : "click to add customer counts"}`}
                    className="flex h-7 items-center rounded-md px-2 text-[10px] font-bold transition-transform hover:scale-105"
                    style={m.hasData
                      ? { background: "color-mix(in srgb, var(--brand) 25%, transparent)", color: "var(--text-primary)" }
                      : { background: "var(--grid)", color: "var(--text-muted)", border: "1px dashed var(--border-hairline)" }}>
                    {monthLabel(m.month.slice(0, 7)).split(" ")[0]}
                  </Link>
                ))}
              </div>
            </div>

            <p className="text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
              Method: repeat rate r = returning ÷ (new + returning). Expected orders per customer = 1 ÷ (1 − r), so
              LTV = AOV ÷ (1 − r). CAC uses <em>new</em> customers only — repeat orders shouldn&apos;t flatter acquisition cost.
              {" "}{latest && prev && `Consistency check: ${monthLabel(prev.month.slice(0, 7))} ${ratio(prev.ltvCac!)}× vs ${monthLabel(latest.month.slice(0, 7))} ${ratio(latest.ltvCac!)}×.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
