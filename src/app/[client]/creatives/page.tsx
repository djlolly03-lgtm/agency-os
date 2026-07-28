import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, getCreatives, type CreativeStatus } from "@/lib/queries";
import { inrCompact, inr, num, ratio, pct } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";

const STATUS_ORDER: CreativeStatus[] = ["winner", "hidden_gem", "fatiguing", "losing", "testing", "average"];

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

  let rows = await getCreatives(client.id);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const activeCount = rows.filter((r) => r.active).length;

  const showAll = sp.active === "all";
  if (!showAll) rows = rows.filter((r) => r.active);
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) =>
      r.ad_name.toLowerCase().includes(q) || r.campaign.toLowerCase().includes(q) || r.ad_set.toLowerCase().includes(q));
  }

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: sp.status, q: sp.q, active: sp.active, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Creative performance</h2>
        <form className="flex items-center gap-2" action={`/${slug}/creatives`}>
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.active && <input type="hidden" name="active" value={sp.active} />}
          <input
            name="q" defaultValue={sp.q ?? ""} placeholder="Search name, campaign…"
            className="w-56 rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
          />
        </form>
      </div>

      {/* status filter row */}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <Link href={qs({ status: undefined })}
          className="rounded-full border px-3 py-1"
          style={{ borderColor: "var(--border-hairline)", background: !sp.status ? "var(--grid)" : "transparent", fontWeight: !sp.status ? 600 : 400 }}>
          All {showAll ? rows.length : activeCount}
        </Link>
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={qs({ status: s })}
            className="rounded-full border px-3 py-1 capitalize"
            style={{ borderColor: "var(--border-hairline)", background: sp.status === s ? "var(--grid)" : "transparent", fontWeight: sp.status === s ? 600 : 400 }}>
            {s.replace("_", " ")} {counts[s] ?? 0}
          </Link>
        ))}
        <span className="mx-2" style={{ color: "var(--text-muted)" }}>·</span>
        <Link href={qs({ active: showAll ? undefined : "all" })}
          className="rounded-full border px-3 py-1"
          style={{ borderColor: "var(--border-hairline)", background: showAll ? "var(--grid)" : "transparent" }}>
          {showAll ? "Showing all-time" : "Include inactive"}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => (
          <Link key={c.ad_id} href={`/${slug}/creatives/${c.ad_id}`}
            className="card card-lift flex flex-col gap-2 p-4">
            {c.asset_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/v1/assets/${c.asset_id}/thumb`}
                alt={c.asset_filename ?? c.ad_name}
                loading="lazy"
                className="h-32 w-full rounded-md object-cover"
                style={{ background: "var(--grid)" }}
              />
            )}
            <div className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-sm font-medium">{c.ad_name}</span>
              <StatusChip status={c.status} muted={!c.active} />
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {c.campaign} · {c.format} · {c.days_running}d {c.active ? "running" : "(inactive)"}
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-semibold tabular">{inrCompact(c.spend)}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Spend</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular">{ratio(c.roas)}×</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>ROAS</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular">{num(c.purchases)}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Orders</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-semibold tabular">{pct(c.ctr)}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CTR</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular">{c.purchases > 0 ? inr(c.cpa) : "—"}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CPA</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular">{inr(c.cpm)}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CPM</div>
              </div>
            </div>
            {c.status_reasons.length > 0 && (
              <div className="rounded-md px-2 py-1.5 text-xs" style={{ background: "var(--page)", color: "var(--text-secondary)" }}>
                {c.status_reasons[0]}
              </div>
            )}
          </Link>
        ))}
      </div>
      {rows.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No creatives match these filters.</p>
      )}
    </div>
  );
}
