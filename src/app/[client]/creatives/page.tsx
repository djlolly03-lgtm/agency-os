import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, getCreatives, type CreativeStatus, type CreativeRollup } from "@/lib/queries";
import { inrCompact, ratio } from "@/lib/format";
import { CinemaBanner, BannerStat } from "@/components/hero-cinema";
import { SectionHeader } from "@/components/section-header";
import { CreativeCard, toneFor } from "@/components/creative-card";
import { FadeIn } from "@/components/motion";
import { MapPin, Package, Table2 } from "lucide-react";

const STATUS_ORDER: CreativeStatus[] = ["winner", "hidden_gem", "fatiguing", "losing", "testing", "average"];

/** 14d rollup line for a tier header. */
function tierMeta(rows: CreativeRollup[], baseline: number): string {
  const spend = rows.reduce((t, r) => t + (r.active ? r.window_spend : 0), 0);
  const revenue = rows.reduce((t, r) => t + (r.active ? r.window_revenue : 0), 0);
  const roas = spend > 0 ? revenue / spend : 0;
  return `${rows.length} creatives · ${inrCompact(spend)} in 14d at ${ratio(roas)}× · account ${ratio(baseline)}×`;
}

export default async function CreativesPage({
  params, searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ status?: string; q?: string; active?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const all = await getCreatives(client.id);
  const counts: Record<string, number> = {};
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const activeRows = all.filter((r) => r.active);

  // the line everyone is judged against: account-wide 14d ROAS
  const winSpend = all.reduce((t, r) => t + r.window_spend, 0);
  const winRev = all.reduce((t, r) => t + r.window_revenue, 0);
  const baseline = winSpend > 0 ? winRev / winSpend : 0;

  const showAll = sp.active === "all";
  let rows = showAll ? all : activeRows;
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) =>
      r.ad_name.toLowerCase().includes(q) || r.campaign.toLowerCase().includes(q) || r.ad_set.toLowerCase().includes(q));
  }
  const filtered = Boolean(sp.status || sp.q);

  // ---- the triage: what to do with money, in order ----
  const byRoas = (a: CreativeRollup, b: CreativeRollup) =>
    (b.window_spend > 0 ? b.window_revenue / b.window_spend : 0) - (a.window_spend > 0 ? a.window_revenue / a.window_spend : 0);
  const bySpend = (a: CreativeRollup, b: CreativeRollup) => b.window_spend - a.window_spend;

  const scale = activeRows.filter((r) => r.status === "winner" || r.status === "hidden_gem").sort(byRoas);
  const bleed = activeRows.filter((r) => r.status === "losing" || r.status === "fatiguing").sort(bySpend);
  const watch = activeRows.filter((r) => r.status === "average" || r.status === "testing").sort(bySpend);
  const retired = showAll ? all.filter((r) => !r.active).sort(bySpend) : [];

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: sp.status, q: sp.q, active: sp.active, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const grid = (list: CreativeRollup[], compact = false) => (
    <div className={`grid gap-3 sm:grid-cols-2 ${compact ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {list.map((c) => (
        <CreativeCard key={c.ad_id} c={c} slug={slug} baseline={baseline} tone={toneFor(c)} compact={compact} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Creative engine"
        line1="Winners, gems,"
        line2="and the fatigued."
        sub={`Every ad judged on its trailing 14 days against the account line of ${ratio(baseline)}× — scale the green, fix the red`}
        skyline={activeRows.map((r) => r.window_spend).sort((a, b) => b - a)}
        stats={<>
          <BannerStat label="Scale these" value={String(scale.length)} sub="winners + gems" />
          <BannerStat label="Watch" value={String(watch.length)} sub="testing + average" />
          <BannerStat label="Fix or kill" value={String(bleed.length)} sub="fatiguing + losing" />
        </>}
      />

      {/* the rest of the library */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/${slug}/monthly`} className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
          style={{ borderColor: "var(--border-hairline)" }}>
          <Table2 size={13} /> Monthly report
        </Link>
        <Link href={`/${slug}/geography`} className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
          style={{ borderColor: "var(--border-hairline)" }}>
          <MapPin size={13} /> Geography — pincode &amp; city
        </Link>
        <Link href={`/${slug}/products`} className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
          style={{ borderColor: "var(--border-hairline)" }}>
          <Package size={13} /> Product performance
        </Link>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <Link href={qs({ status: undefined })}
            className="rounded-full border px-3 py-1"
            style={{ borderColor: "var(--border-hairline)", background: !sp.status ? "var(--grid)" : "transparent", fontWeight: !sp.status ? 600 : 400 }}>
            All {showAll ? all.length : activeRows.length}
          </Link>
          {STATUS_ORDER.map((s) => (
            <Link key={s} href={qs({ status: s })}
              className="rounded-full border px-3 py-1 capitalize"
              style={{ borderColor: "var(--border-hairline)", background: sp.status === s ? "var(--grid)" : "transparent", fontWeight: sp.status === s ? 600 : 400 }}>
              {s.replace("_", " ")} {counts[s] ?? 0}
            </Link>
          ))}
          <span className="mx-1" style={{ color: "var(--text-muted)" }}>·</span>
          <Link href={qs({ active: showAll ? undefined : "all" })}
            className="rounded-full border px-3 py-1"
            style={{ borderColor: "var(--border-hairline)", background: showAll ? "var(--grid)" : "transparent" }}>
            {showAll ? "Hiding retired" : "Include retired"}
          </Link>
        </div>
        <form action={`/${slug}/creatives`}>
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.active && <input type="hidden" name="active" value={sp.active} />}
          <input
            name="q" defaultValue={sp.q ?? ""} placeholder="Search name, campaign…"
            className="w-56 rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
          />
        </form>
      </div>

      {filtered ? (
        /* filtered view: one flat grid, still verdict-colored */
        rows.length === 0
          ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No creatives match these filters.</p>
          : grid(rows)
      ) : (
        <>
          {/* ===== 1 · Scale ===== */}
          {scale.length > 0 && (
            <>
              <FadeIn>
                <SectionHeader index="01" eyebrow="Scale" title="Feed these."
                  meta={tierMeta(scale, baseline)} />
              </FadeIn>
              <FadeIn>{grid(scale)}</FadeIn>
            </>
          )}

          {/* ===== 2 · Fix or kill ===== */}
          {bleed.length > 0 && (
            <>
              <FadeIn delay={0.05}>
                <SectionHeader index="02" eyebrow="Fix or kill" title="Money is leaking here."
                  meta={tierMeta(bleed, baseline)} />
              </FadeIn>
              <FadeIn delay={0.05}>{grid(bleed)}</FadeIn>
            </>
          )}

          {/* ===== 3 · Watch ===== */}
          {watch.length > 0 && (
            <>
              <FadeIn delay={0.05}>
                <SectionHeader index="03" eyebrow="Watch" title="Let them cook."
                  meta={tierMeta(watch, baseline)} />
              </FadeIn>
              <FadeIn delay={0.05}>{grid(watch, true)}</FadeIn>
            </>
          )}

          {/* ===== Retired (opt-in) ===== */}
          {retired.length > 0 && (
            <>
              <FadeIn delay={0.05}>
                <SectionHeader index="04" eyebrow="Retired" title="The archive."
                  meta={`${retired.length} creatives no longer running · judged on lifetime`} />
              </FadeIn>
              <FadeIn delay={0.05}>{grid(retired, true)}</FadeIn>
            </>
          )}
        </>
      )}
    </div>
  );
}
