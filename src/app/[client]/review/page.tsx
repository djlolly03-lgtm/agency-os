import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, getMonths, getMonthlyReport, getCustomerEconomics,
  getMonthlyNameRollups, getAdRangeRollups, getTimeseries, getGoals, getFunnelMonthly,
  getReviewNotes, REVIEW_SECTIONS,
} from "@/lib/queries";
import { getRfmSegments } from "@/lib/shopify";
import { getRetentionChannels } from "@/lib/retention";
import { aggregateProduceMonth, classifyProduce, seasonRadar } from "@/lib/seasons";
import { computeInsights } from "@/lib/insights";
import { inr, inrCompact, num, pct, ratio, monthLabel } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import { ReviewNote } from "@/components/review-note";
import { PrintButton } from "@/components/print-button";
import { CommitmentsEditor, CommitmentCheckins } from "@/components/commitments";
import { parseCommitments } from "@/lib/commitments";
import { monthEndDay } from "@/lib/periods";

/**
 * The monthly review as a DECISION MEMO — not a stats report. Structure:
 *   01 Verdict         one sentence + four graded numbers + the calls
 *   02 Said vs happened last month's commitments stamped, the revenue bridge
 *   03 The leaks       "is acquisition paying back?" / "where is money leaking?"
 *   04 The people      "who should we talk to?" / "what do we sell next month?"
 *   05 Commitments     owner + date + proof rows that become 02 next month
 * Decisions lead; a number appears only as evidence for a call. Print-first:
 * Cmd-P → Save as PDF (see @media print in globals.css).
 */

const SEV_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  critical: { label: "Act now", bg: "var(--status-critical)", fg: "#ffffff" },
  watch: { label: "Decide", bg: "var(--status-warning)", fg: "#101214" },
  fyi: { label: "Note", bg: "var(--grid)", fg: "var(--text-secondary)" },
};

function Masthead({ n, label, client }: { n: string; label: string; client: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 pb-2"
      style={{ borderColor: "var(--text-primary)" }}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--brand)" }}>
        {client} — Performance review
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
        {n} · {label}
      </span>
    </div>
  );
}

function Dot({ tone }: { tone: "good" | "warn" | "bad" | "mute" }) {
  const c = tone === "good" ? "var(--status-good)" : tone === "warn" ? "var(--status-warning)"
    : tone === "bad" ? "var(--status-critical)" : "var(--text-muted)";
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />;
}

export default async function ReviewPage({ params, searchParams }: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const months = await getMonths(client.id);                 // desc
  const defaultMonth = months.length > 1 ? months[1] : months[0];
  const month = sp.month && months.includes(sp.month + "-01") ? sp.month + "-01" : defaultMonth;
  const mLabel = monthLabel(month.slice(0, 7));
  const monthEnd = monthEndDay(month);
  const prevMonth = new Date(Date.UTC(
    Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const prevLabel = monthLabel(prevMonth.slice(0, 7));

  const [report, custMonths, rfm, nameRollups, adRollups, daily, goalRows, retention,
    funnelMonthly, notes, prevNotes] = await Promise.all([
    getMonthlyReport(client.id),
    getCustomerEconomics(client.id),
    getRfmSegments(client.id),
    getMonthlyNameRollups(client.id),
    getAdRangeRollups(client.id, { from: month, to: monthEnd }),
    getTimeseries(client.id, "day"),
    getGoals(client.id, month),
    getRetentionChannels(client.id),
    getFunnelMonthly(client.id),
    getReviewNotes(client.id, month),
    getReviewNotes(client.id, prevMonth),
  ]);

  const row = report.find((r) => r.month === month);
  const prevRow = report.find((r) => r.month === prevMonth);
  if (!row) notFound();
  // the newest month with data is (almost always) still in progress — its
  // review reads like a 36% collapse until you notice it's a half month
  const isPartial = month === months[0];

  // ---- headline economics ----
  const paidSpend = row.meta.spend + row.google.spend;
  const paidRevenue = row.meta.revenue + row.google.revenue;
  const totalRevenue = row.totalRevenue ?? paidRevenue;
  const totalOrders = row.totalOrders ?? (row.meta.purchases + row.google.purchases);
  const revDelta = prevRow?.totalRevenue && row.totalRevenue
    ? row.totalRevenue / prevRow.totalRevenue - 1 : null;

  const cust = custMonths.find((m) => m.month === month);
  const custPrev = custMonths.find((m) => m.month === prevMonth);
  const ltvCac = cust?.ltvCac ?? null;
  const ltvCacPrev = custPrev?.ltvCac ?? null;

  const explicitGoal = goalRows.find((g) => String(g.metric) === "revenue");
  const goal = explicitGoal
    ? { target: Number(explicitGoal.target), isDefault: false }
    : prevRow ? { target: (prevRow.totalRevenue ?? 0) * 1.25, isDefault: true } : null;
  const att = goal && goal.target > 0 ? paidRevenue / goal.target : null;

  // ---- insights → the calls ----
  const rangeRows = daily.filter((d) => d.period >= month && d.period <= monthEnd);
  const byDay = new Map<string, { day: string; spend: number; revenue: number; purchases: number }>();
  for (const r of rangeRows) {
    const d = byDay.get(r.period) ?? { day: r.period, spend: 0, revenue: 0, purchases: 0 };
    d.spend += r.spend; d.purchases += r.purchases; d.revenue += r.revenue;
    byDay.set(r.period, d);
  }
  const platformTotals = [
    { platform: "meta", spend: row.meta.spend, revenue: row.meta.revenue, roas: row.meta.spend > 0 ? row.meta.revenue / row.meta.spend : 0 },
    { platform: "google", spend: row.google.spend, revenue: row.google.revenue, roas: row.google.spend > 0 ? row.google.revenue / row.google.spend : 0 },
  ].filter((p) => p.spend > 0);
  const insights = computeInsights({
    slug, monthLabel: mLabel, isCurrentMonth: false, monthParam: month.slice(0, 7),
    monthDaily: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    platformTotals, adRollups, goal, monthRevenue: paidRevenue,
    seasonal: undefined, customerMonths: custMonths,
  });
  const calls = insights.filter((i) => i.action).slice(0, 3);

  // ---- verdict sentence, assembled from graded facts ----
  const verb = revDelta == null ? "closed at"
    : revDelta >= 0.005 ? "grew to" : revDelta <= -0.005 ? "slipped to" : "held the line at";
  const tail = ltvCac != null && ltvCacPrev != null
    ? (ltvCac < ltvCacPrev - 0.2 ? "but growth got more expensive"
      : ltvCac > ltvCacPrev + 0.2 ? "and every acquired rupee worked harder"
      : "with customer economics holding steady")
    : row.blendedRoas >= 3 ? "with efficiency holding" : "with efficiency under watch";

  // ---- bridge (complete months with store totals only) ----
  const bridge = prevRow && row.organicRevenue != null && prevRow.organicRevenue != null
    ? [
        { label: "Meta", delta: row.meta.revenue - prevRow.meta.revenue },
        { label: "Google", delta: row.google.revenue - prevRow.google.revenue },
        { label: "Organic", delta: row.organicRevenue - prevRow.organicRevenue },
      ]
    : null;
  const bridgeMax = bridge ? Math.max(...bridge.map((b) => Math.abs(b.delta)), 1) : 1;

  // ---- channel table (Direct order-count/AOV deliberately blank — the
  // residual order count is polluted by platform double-claiming) ----
  const channelRows: Array<{ name: string; spend: number | null; orders: number | null; revenue: number }> = [
    { name: "Meta Ads", spend: row.meta.spend, orders: row.meta.purchases, revenue: row.meta.revenue },
    { name: "Google Ads", spend: row.google.spend, orders: row.google.purchases, revenue: row.google.revenue },
    ...(row.totalRevenue != null
      ? [{ name: "Direct / organic", spend: null, orders: null, revenue: row.organicRevenue ?? 0 }]
      : []),
  ].filter((c) => c.revenue > 0 || (c.spend ?? 0) > 0);

  // ---- cart decay ----
  const cart = funnelMonthly.filter((f) => f.atc > 0 && f.atcToBuy != null).slice(-9);
  const cartMax = Math.max(...cart.map((f) => f.atcToBuy!), 0.01);
  const cartSel = funnelMonthly.find((f) => f.month === month);
  const dropped = cartSel ? Math.max(0, Math.round(cartSel.atc - cartSel.purchases)) : null;
  const cartFirst = cart[0], cartLast = cart[cart.length - 1];
  const cartHalved = cartFirst?.atcToBuy != null && cartLast?.atcToBuy != null
    && cartLast.atcToBuy! <= cartFirst.atcToBuy! * 0.55;

  // ---- people ----
  const retentionRow = retention.find((r) => r.month === month) ?? retention[retention.length - 1] ?? null;
  const paidRoas = paidSpend > 0 ? paidRevenue / paidSpend : null;
  const twoPlus = rfm ? rfm.segments.filter((s) => ["champions", "slipping", "lost_regulars"].includes(s.key))
    .reduce((s, x) => s + x.customers, 0) : 0;
  const returningShare = cust?.newRevenue != null && cust?.repeatRevenue != null
    && cust.newRevenue + cust.repeatRevenue > 0
    ? cust.repeatRevenue / (cust.newRevenue + cust.repeatRevenue) : null;

  // ---- seasons ----
  const monthNum = Number(month.slice(5, 7));
  const produceAgg = aggregateProduceMonth(nameRollups.filter((r) => r.month === month), monthNum);
  const historicalKeys = new Set(
    nameRollups.map((r) => classifyProduce(r.campaign, r.ad)?.key).filter(Boolean) as string[]);
  const radar = seasonRadar(produceAgg, monthNum, historicalKeys);
  const closingKeys = new Set(radar.closing.map((c) => c.produce.key));

  const challenges = REVIEW_SECTIONS.find((s) => s.key === "challenges")!;
  const support = REVIEW_SECTIONS.find((s) => s.key === "support_needed")!;
  const prevCommitmentsRaw = prevNotes["commitments"] ?? "";
  const hasPrevCommitments = parseCommitments(prevCommitmentsRaw).some((c) => c.text.trim());
  const prevLegacyPlan = prevNotes["next_month"] ?? "";

  const qa = (n: string, q: string, a: string, aColor?: string) => (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "var(--text-muted)" }}>{n}</div>
      <h2 className="review-h2" style={{ marginBottom: 0 }}>{q}</h2>
      <p className="text-sm font-bold leading-6" style={{ color: aColor ?? "var(--text-primary)" }}>{a}</p>
    </div>
  );

  return (
    <div className="review-page flex flex-col gap-5">
      {/* ===== toolbar (screen only) ===== */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <MonthPicker months={months} selected={month} basePath={`/${slug}/review`} />
        <div className="flex items-center gap-3">
          <Link href={`/${slug}?month=${month.slice(0, 7)}`} className="text-xs underline"
            style={{ color: "var(--text-secondary)" }}>
            Open the live dashboard →
          </Link>
          <PrintButton />
        </div>
      </div>

      {isPartial && (
        <div className="review-block rounded-xl border-2 px-4 py-3 text-sm font-semibold"
          style={{ borderColor: "var(--status-warning)", color: "var(--text-primary)" }}>
          {mLabel} is still in progress — every figure below is month-to-date, and comparisons
          against complete months will read worse than they are. This review is presentation-ready
          only once the month closes.
        </div>
      )}

      {/* ============ 01 · THE VERDICT ============ */}
      <section className="review-block card px-6 py-6">
        <Masthead n="01" label="The verdict" client={client.name} />
        <h1 className="review-h2" style={{ fontSize: "1.95rem", lineHeight: 1.18 }}>
          {mLabel} {verb} {inrCompact(totalRevenue)} — {tail}.
        </h1>
        <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--text-secondary)", maxWidth: 620 }}>
          {calls.filter((c) => c.severity === "critical").length > 0
            ? `${calls.filter((c) => c.severity === "critical").length} of the calls below can't wait. `
            : "Nothing below is on fire. "}
          The rest of this document is evidence, in the order the decisions need it.
        </p>

        {/* graded numbers */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)" }}>
            <div className="flex items-center gap-1.5"><Dot tone={revDelta == null ? "mute" : revDelta >= 0 ? "good" : "warn"} />
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Revenue</span></div>
            <div className="tabular mt-1 text-2xl font-extrabold">{inrCompact(totalRevenue)}</div>
            <div className="text-[10.5px] leading-4" style={{ color: "var(--text-secondary)" }}>
              {revDelta != null ? `${revDelta >= 0 ? "▲" : "▼"} ${Math.abs(revDelta * 100).toFixed(0)}% vs ${prevLabel}` : `${num(totalOrders)} orders`}
            </div>
          </div>
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)" }}>
            <div className="flex items-center gap-1.5"><Dot tone={row.blendedRoas >= 3 ? "good" : row.blendedRoas >= 2 ? "warn" : "bad"} />
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Blended ROAS</span></div>
            <div className="tabular mt-1 text-2xl font-extrabold">{ratio(row.blendedRoas)}×</div>
            <div className="text-[10.5px] leading-4" style={{ color: "var(--text-secondary)" }}>paid {ratio(row.paidRoas)}× · spend {inrCompact(paidSpend)}</div>
          </div>
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)" }}>
            <div className="flex items-center gap-1.5"><Dot tone={ltvCac == null ? "mute" : ltvCac >= 3 ? "good" : ltvCac >= 2 ? "warn" : "bad"} />
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>LTV : CAC</span></div>
            <div className="tabular mt-1 text-2xl font-extrabold">{ltvCac != null ? `${ratio(ltvCac)}×` : "—"}</div>
            <div className="text-[10.5px] leading-4" style={{ color: "var(--text-secondary)" }}>
              {ltvCacPrev != null ? `was ${ratio(ltvCacPrev)}× in ${prevLabel}` : "needs customer counts"}
            </div>
          </div>
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)" }}>
            <div className="flex items-center gap-1.5"><Dot tone={att == null ? "mute" : att >= 1 ? "good" : att >= 0.85 ? "warn" : "bad"} />
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Revenue goal</span></div>
            <div className="tabular mt-1 text-2xl font-extrabold">{att != null ? `${Math.round(att * 100)}%` : "—"}</div>
            <div className="text-[10.5px] leading-4" style={{ color: "var(--text-secondary)" }}>
              {goal ? `${inrCompact(paidRevenue)} paid vs ${inrCompact(goal.target)}${goal.isDefault ? " (default)" : ""}` : "no goal set"}
            </div>
          </div>
        </div>

        {/* the calls */}
        {calls.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em]">The calls this month</div>
            {calls.map((c, i) => {
              const chip = SEV_CHIP[c.severity];
              return (
                <div key={i} className="flex items-start gap-4 rounded-2xl border px-5 py-4"
                  style={{ borderColor: "var(--border-hairline)" }}>
                  <span className="tabular shrink-0 text-3xl font-medium italic"
                    style={{ fontFamily: "var(--font-serif), Georgia, serif", color: "var(--brand)", minWidth: 26, lineHeight: 1 }}>
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="w-fit rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
                      style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                    <div className="text-[15px] font-bold leading-5">{c.action}</div>
                    <div className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
                      <strong className="tabular">{c.metric}</strong> {c.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============ 02 · SAID VS HAPPENED ============ */}
      <div className="page-break" />
      <section className="review-block card px-6 py-6">
        <Masthead n="02" label="Said vs happened" client={client.name} />
        <h2 className="review-h2">What we said in {prevLabel} — and what {mLabel.split(" ")[0]} did.</h2>
        {hasPrevCommitments ? (
          <CommitmentCheckins slug={slug} prevMonth={prevMonth} prevLabel={prevLabel}
            initial={prevCommitmentsRaw} />
        ) : prevLegacyPlan ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {prevLabel}&rsquo;s plan was logged as prose (before commitments became structured) — grade it in the meeting:
            </p>
            <div className="rounded-xl border px-4 py-3 text-sm leading-6" style={{ borderColor: "var(--border-hairline)", whiteSpace: "pre-line" }}>
              {prevLegacyPlan}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            No commitments were logged for {prevLabel}. The loop starts this month — page 05 writes
            the plan, and next month&rsquo;s review reopens it here, stamped.
          </p>
        )}

        {bridge && (
          <div className="mt-6 flex flex-col gap-3">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em]">
              Where the {inrCompact(Math.abs((row.totalRevenue ?? 0) - (prevRow?.totalRevenue ?? 0)))} went — {prevLabel.split(" ")[0]} to {mLabel.split(" ")[0]}
            </div>
            <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "var(--border-hairline)" }}>
              <div className="flex items-baseline justify-between">
                <span className="tabular text-lg font-extrabold">{inrCompact(prevRow!.totalRevenue!)} <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>{prevLabel}</span></span>
                <span className="tabular text-lg font-extrabold">{inrCompact(row.totalRevenue!)} <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>{mLabel}</span></span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {bridge.map((b) => {
                  const w = Math.max(6, Math.round((Math.abs(b.delta) / bridgeMax) * 260));
                  const neg = b.delta < 0;
                  return (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="w-16 text-[10.5px] font-bold" style={{ color: "var(--text-secondary)" }}>{b.label}</span>
                      <div className="flex flex-1 items-center">
                        <div className="flex w-1/2 justify-end">{neg && <div className="h-3.5 rounded" style={{ width: w, background: "var(--status-critical)", opacity: 0.85 }} />}</div>
                        <div className="w-1/2">{!neg && <div className="h-3.5 rounded" style={{ width: w, background: "var(--status-good)", opacity: 0.9 }} />}</div>
                      </div>
                      <span className="tabular w-20 text-right text-[11.5px] font-bold"
                        style={{ color: neg ? "var(--status-critical)" : "var(--status-good)" }}>
                        {neg ? "−" : "+"}{inrCompact(Math.abs(b.delta))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* the month, reconciled */}
        <div className="mt-6 flex flex-col gap-2">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em]">The month, reconciled</div>
          <table className="review-table">
            <thead>
              <tr><th>Channel</th><th>Ad spend</th><th>Orders</th><th>Revenue</th><th>AOV</th><th>ROAS</th><th>Share</th></tr>
            </thead>
            <tbody>
              {channelRows.map((c) => (
                <tr key={c.name}>
                  <td className="font-medium">{c.name}</td>
                  <td className="tabular">{c.spend != null ? inrCompact(c.spend) : "—"}</td>
                  <td className="tabular">{c.orders != null && c.orders > 0 ? num(c.orders) : "—"}</td>
                  <td className="tabular">{inrCompact(c.revenue)}</td>
                  <td className="tabular">{c.orders != null && c.orders > 0 ? inr(c.revenue / c.orders) : "—"}</td>
                  <td className="tabular">{c.spend != null && c.spend > 0 ? `${ratio(c.revenue / c.spend)}×` : "N/A"}</td>
                  <td className="tabular">{totalRevenue > 0 ? pct(c.revenue / totalRevenue, 1) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td><td className="tabular">{inrCompact(paidSpend)}</td>
                <td className="tabular">{num(totalOrders)}</td><td className="tabular">{inrCompact(totalRevenue)}</td>
                <td className="tabular">{row.aov != null ? inr(row.aov) : "—"}</td>
                <td className="tabular">{ratio(row.blendedRoas)}×</td><td className="tabular">100%</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[10.5px] leading-4" style={{ color: "var(--text-muted)" }}>
            Platforms self-attribute and can both claim one order, so channel rows deliberately don&rsquo;t
            sum; Direct&rsquo;s order count and AOV stay blank for the same reason. The Total row reconciles to Shopify.
          </p>
        </div>

        {/* in the team's words */}
        <div className="mt-5">
          <ReviewNote slug={slug} month={month} section={challenges.key}
            label={challenges.label} hint={challenges.hint} initial={notes[challenges.key] ?? ""} />
        </div>
      </section>

      {/* ============ 03 · THE LEAKS ============ */}
      <div className="page-break" />
      <section className="review-block card px-6 py-6">
        <Masthead n="03" label="The leaks" client={client.name} />

        {cust?.hasData && ltvCac != null && (
          <div className="flex flex-col gap-3">
            {qa("Question 01", "Is acquisition paying back?",
              // ₹-with-paise here, not inr() — rounding 1.66 and 2.45 both to "₹2"
              // once produced "bought ₹2, down from ₹2", which reads as gibberish
              ltvCac >= 3
                ? `Yes — ₹1 of spend buys ₹${ltvCac.toFixed(2)} of expected lifetime value.`
                : ltvCac >= 2
                  ? `Barely — ₹1 of spend buys ₹${ltvCac.toFixed(2)} of lifetime value${ltvCacPrev != null ? ` (₹${ltvCacPrev.toFixed(2)} in ${prevLabel})` : ""}. Watchable, not scalable.`
                  : `Not at ${mLabel.split(" ")[0]}'s prices — ₹1 of spend bought ₹${ltvCac.toFixed(2)} of lifetime value${ltvCacPrev != null ? `, down from ₹${ltvCacPrev.toFixed(2)} in ${prevLabel}` : ""}.`,
              ltvCac >= 3 ? "var(--status-good)" : ltvCac >= 2 ? "var(--text-primary)" : "var(--status-critical)")}
            <div className="grid gap-4 rounded-2xl border px-5 py-4 sm:grid-cols-[1.3fr_1fr]" style={{ borderColor: "var(--border-hairline)" }}>
              <div className="flex flex-col gap-2.5">
                <div>
                  <div className="flex justify-between text-[10.5px]"><span style={{ color: "var(--text-muted)" }} className="font-bold">CAC · new customer</span><span className="tabular font-extrabold">{cust.cacNew != null ? inr(cust.cacNew) : "—"}</span></div>
                  <div className="mt-1 h-3.5 rounded" style={{ background: "var(--grid)" }}>
                    {cust.cacNew != null && cust.ltv != null && (
                      <div className="h-3.5 rounded" style={{ width: `${Math.min(100, (100 * cust.cacNew) / cust.ltv)}%`, background: "var(--brand-accent)" }} />
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10.5px]"><span style={{ color: "var(--text-muted)" }} className="font-bold">Derived LTV</span><span className="tabular font-extrabold">{cust.ltv != null ? inr(cust.ltv) : "—"}</span></div>
                  <div className="mt-1 h-3.5 rounded" style={{ background: "var(--brand)" }} />
                </div>
                <p className="text-[11px] leading-4" style={{ color: "var(--text-secondary)" }}>
                  The gap between these bars is the margin of safety{ltvCacPrev != null && ltvCac < ltvCacPrev ? " — it narrowed this month" : ""}.
                </p>
              </div>
              <div className="flex flex-col gap-3 border-l pl-5" style={{ borderColor: "var(--border-hairline)" }}>
                <div>
                  <div className="text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>New customers</div>
                  <div className="tabular text-xl font-extrabold">{num(cust.newCustomers!)}
                    {custPrev?.newCustomers != null && custPrev.newCustomers > 0 && (
                      <span className="ml-1 text-xs font-bold" style={{ color: cust.newCustomers! >= custPrev.newCustomers ? "var(--status-good)" : "var(--status-critical)" }}>
                        {cust.newCustomers! >= custPrev.newCustomers ? "▲" : "▼"}{Math.abs(Math.round((cust.newCustomers! / custPrev.newCustomers - 1) * 100))}%
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Repeat rate</div>
                  <div className="tabular text-xl font-extrabold">{pct(cust.repeatRate!)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {cart.length >= 4 && (
          <div className="mt-6 flex flex-col gap-3">
            {qa("Question 02", "Where is money leaking?",
              cartHalved ? "At the cart — the add-to-cart → purchase rate has roughly halved." : "Watch the cart — conversion after add-to-cart is drifting down.")}
            <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "var(--border-hairline)" }}>
              <div className="flex items-end gap-2" style={{ height: 110 }}>
                {cart.map((f) => {
                  const rate = f.atcToBuy!;
                  const h = Math.max(10, Math.round((rate / cartMax) * 92));
                  const color = rate >= 0.13 ? "var(--brand)" : rate >= 0.09 ? "var(--brand-accent)" : "var(--status-critical)";
                  return (
                    <div key={f.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="tabular text-[9.5px] font-bold" style={{ color: "var(--text-secondary)" }}>{(rate * 100).toFixed(1)}%</span>
                      <div className="w-full rounded-t" style={{ height: h, background: color, opacity: 0.9 }} />
                      <span className="text-[8.5px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                        {monthLabel(f.month.slice(0, 7)).split(" ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
                {dropped != null && <><strong className="tabular">{num(dropped)}</strong> carts were abandoned after add-to-cart in {mLabel}. </>}
                Checkout shows no delivery date — for perishables that&rsquo;s a trust question before it&rsquo;s a payment
                question, and the drop-off calls on page 05 settle which. Per-SKU stock-out spend joins this page
                once the product table lands (ask on page 05).
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ============ 04 · THE PEOPLE ============ */}
      <div className="page-break" />
      <section className="review-block card px-6 py-6">
        <Masthead n="04" label="The people" client={client.name} />

        <div className="flex flex-col gap-3">
          {qa("Question 03", "Who should we be talking to?",
            retentionRow?.waRoas != null && paidRoas != null
              ? `The customers we already own — retention money worked ${(retentionRow.waRoas / paidRoas).toFixed(1)}× harder than paid${retentionRow.month !== month ? ` (latest data: ${monthLabel(retentionRow.month.slice(0, 7))})` : ""}.`
              : "The customers we already own — the win-back and nudge lists below are ready to load.")}

          {retentionRow?.waRoas != null && paidRoas != null && (
            <div className="flex flex-col gap-2.5 rounded-2xl border px-5 py-4" style={{ borderColor: "var(--border-hairline)" }}>
              <div>
                <div className="flex justify-between text-[10.5px]">
                  <span className="font-bold" style={{ color: "var(--text-muted)" }}>
                    WhatsApp remarketing{retentionRow.waSpend != null && retentionRow.waRevenue != null ? ` · ${inrCompact(retentionRow.waSpend)} → ${inrCompact(retentionRow.waRevenue)}` : ""}
                  </span>
                  <span className="tabular font-extrabold" style={{ color: "var(--brand)" }}>{ratio(retentionRow.waRoas)}×</span>
                </div>
                <div className="mt-1 h-4 rounded" style={{ background: "var(--brand)" }} />
              </div>
              <div>
                <div className="flex justify-between text-[10.5px]">
                  <span className="font-bold" style={{ color: "var(--text-muted)" }}>Paid ads · {inrCompact(paidSpend)} → {inrCompact(paidRevenue)}</span>
                  <span className="tabular font-extrabold">{ratio(paidRoas)}×</span>
                </div>
                <div className="mt-1 h-4 rounded" style={{ background: "var(--grid)" }}>
                  <div className="h-4 rounded" style={{ width: `${Math.min(100, (100 * paidRoas) / retentionRow.waRoas)}%`, background: "var(--brand-accent)" }} />
                </div>
              </div>
              <p className="text-[11px] leading-4" style={{ color: "var(--text-secondary)" }}>
                A warm audience always converts better — the point is that
                {returningShare != null ? <> <strong>{pct(returningShare, 0)} of tracked revenue already comes from returning customers</strong> and</> : null} the
                retention engine is still barely funded.
              </p>
            </div>
          )}

          {rfm && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {rfm.segments.map((s) => {
                  const hot = s.key === "slipping" || s.key === "lost_regulars";
                  const border = s.key === "slipping" ? "1.5px solid var(--status-warning)"
                    : s.key === "lost_regulars" ? "1.5px solid var(--status-critical)"
                    : "1px solid var(--border-hairline)";
                  return (
                    <div key={s.key} className="rounded-xl px-3 py-2.5" style={{ border }}>
                      <div className="text-[8.5px] font-extrabold uppercase tracking-[0.08em]"
                        style={{ color: hot ? (s.key === "slipping" ? "var(--status-warning)" : "var(--status-critical)") : "var(--text-muted)" }}>
                        {s.label}
                      </div>
                      <div className="tabular text-lg font-extrabold">{num(s.customers)}</div>
                      <div className="tabular text-[9.5px]" style={{ color: "var(--text-muted)" }}>{inrCompact(s.lifetimeRevenue)} lifetime</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
                The outlined segments are the month&rsquo;s targets — the win-back list (names + numbers) is on the{" "}
                <Link href={`/${slug}/internal#winback`} className="underline" style={{ color: "var(--brand)" }}>internal page</Link>.
                Lookalike seed: the <strong className="tabular">{num(twoPlus)}</strong> two-plus-order customers
                (the {num(rfm.fivePlusCustomers)} five-plus buyers alone carry {pct(rfm.fivePlusRevenueShare, 0)} of
                revenue, but {num(rfm.fivePlusCustomers)}{" "}is below Meta&rsquo;s ~1,000-row floor).
              </p>
            </>
          )}
        </div>

        {(radar.riding.length > 0 || radar.missed.length > 0) && (
          <div className="mt-6 flex flex-col gap-3">
            {qa("Question 04", `What do we sell after ${mLabel.split(" ")[0]}?`,
              radar.missed.length > 0
                ? `The open windows — ${radar.missed.slice(0, 2).map((m) => m.produce.label).join(" and ")} ${radar.missed.length > 1 ? "are" : "is"} in season with zero spend${radar.closing.length ? `, and ${radar.closing[0].produce.label}'s window closes now` : ""}.`
                : `Stay on the winners — ${radar.riding.slice(0, 3).map((r) => r.produce.label).join(", ")} are still inside their windows.`)}
            <div className="flex flex-wrap gap-2">
              {radar.riding.slice(0, 6).map((r) => (
                <span key={r.produce.key} className="tabular rounded-full border px-3 py-1.5 text-[11px] font-bold"
                  style={{ borderColor: "var(--border-hairline)" }}>
                  {r.produce.label} · {inrCompact(r.revenue)}{r.spend > 0 ? ` · ${ratio(r.revenue / r.spend)}×` : ""}
                  {closingKeys.has(r.produce.key) && <span style={{ color: "var(--status-critical)" }}> · closing</span>}
                </span>
              ))}
              {radar.missed.slice(0, 4).map((m) => (
                <span key={m.produce.key} className="tabular rounded-full px-3 py-1.5 text-[11px] font-bold"
                  style={{ border: "1.5px dashed var(--brand-accent)", color: "var(--brand-accent)" }}>
                  {m.produce.label} · in season · ₹0 spend
                </span>
              ))}
            </div>
            <p className="text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
              Carried from page 02: a window only gets budget once its stock plan exists.
            </p>
          </div>
        )}
      </section>

      {/* ============ 05 · COMMITMENTS ============ */}
      <div className="page-break" />
      <section className="review-block card px-6 py-6">
        <Masthead n="05" label="Commitments" client={client.name} />
        <h2 className="review-h2">Next month, in writing.</h2>
        <p className="mb-4 text-[13px] leading-6" style={{ color: "var(--text-secondary)", maxWidth: 640 }}>
          Each commitment carries an owner, a date, and the number that proves it happened.
          This exact table reopens on page 02 of next month&rsquo;s review, stamped Done, Partial or Missed.
        </p>
        <CommitmentsEditor slug={slug} month={month} initial={notes["commitments"] ?? ""} />

        <div className="mt-6">
          <ReviewNote slug={slug} month={month} section={support.key}
            label={support.label} hint={support.hint} initial={notes[support.key] ?? ""} />
        </div>

        {/* sign-off */}
        <div className="mt-8 grid grid-cols-2 gap-10">
          <div className="flex flex-col gap-1.5">
            <div style={{ height: 1.5, background: "var(--text-primary)" }} />
            <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>Pixel Mint Media · date</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div style={{ height: 1.5, background: "var(--text-primary)" }} />
            <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>{client.name} · date</span>
          </div>
        </div>
      </section>

      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {client.name} · {mLabel} review · Pixel Mint Media · every figure recomputed from source data on {new Date().toISOString().slice(0, 10)}
      </p>
    </div>
  );
}
