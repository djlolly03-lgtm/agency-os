import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getClientBySlug, getCreatives, getGoals, getMonths, latestDay } from "@/lib/queries";
import { getRfmSegments } from "@/lib/shopify";
import { inr, inrCompact, monthLabel, num } from "@/lib/format";
import { MatchActions } from "./match-actions";
import { GoalEditor } from "./goal-editor";
import { ManualInputsEditor } from "./manual-inputs-editor";
import { MonthPicker } from "@/components/month-picker";
import { CinemaBanner } from "@/components/hero-cinema";

/**
 * Internal ops page: data-quality + creative matching queues.
 * (Will sit behind agency-role auth when logins land.)
 */
export default async function InternalPage({ params, searchParams }: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();
  const db = await getDb();
  const months = await getMonths(client.id);
  const inputMonth = sp.month && months.includes(sp.month + "-01") ? sp.month + "-01" : months[0];
  const manualRows = await db.query<{ metric: string; value: number }>(
    `select metric, value from manual_actuals where client_id = $1 and month = $2`,
    [client.id, inputMonth]);
  const manualMap = Object.fromEntries(manualRows.map((r) => [String(r.metric), Number(r.value)]));

  const [creatives, assets, runs, rfm] = await Promise.all([
    getCreatives(client.id),
    db.query<{ id: string; filename: string; mime_type: string | null }>(
      `select id, filename, mime_type from creative_assets where client_id = $1 order by filename`, [client.id]),
    db.query<{ source: string; ran_at: string; rows_upserted: number; anomalies: unknown }>(
      `select source, ran_at::text as ran_at, rows_upserted, anomalies
       from sync_runs where client_id = $1 order by ran_at desc limit 8`, [client.id]),
    getRfmSegments(client.id),
  ]);

  const month = (await latestDay(client.id)).slice(0, 7) + "-01";
  const goals = await getGoals(client.id, month);
  const goalMap = Object.fromEntries(goals.map((g) => [String(g.metric), Number(g.target)]));

  const unmatched = creatives.filter((c) => !c.asset_id && c.active);
  const fuzzy = creatives.filter((c) => c.match_type === "fuzzy");
  const linkedAssetIds = new Set(creatives.map((c) => c.asset_id).filter(Boolean));
  const orphanAssets = assets.filter((a) => !linkedAssetIds.has(String(a.id)));

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Internal"
        line1="The engine room —"
        line2="inputs, goals, sync."
        sub="Client-reported numbers, monthly targets, creative matching, and the sync history behind every figure on the dashboard"
      />

      <div className="card p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Monthly inputs — {monthLabel(inputMonth.slice(0, 7))}</h3>
          <MonthPicker months={months} selected={inputMonth} basePath={`/${slug}/internal`} />
        </div>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Client-provided numbers: offline sales, LTV, Shopify store totals. These feed the
          Online/Offline card, division LTV, and the Monthly report.
        </p>
        <ManualInputsEditor slug={slug} month={inputMonth} initial={manualMap} />
      </div>

      <div className="card p-4">
        <h3 className="mb-1 text-sm font-semibold">Goals — {monthLabel(month.slice(0, 7))}</h3>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Drives the pacing card on Overview. Unset metrics default to last month +25%.
        </p>
        <GoalEditor slug={slug} month={month} initial={goalMap} />
      </div>

      {rfm && rfm.winbackTotal > 0 && (
        <div id="winback" className="card p-4" style={{ scrollMarginTop: "100px" }}>
          <h3 className="mb-1 text-sm font-semibold">
            Win-back queue — {num(rfm.winbackTotal)} lost regulars · {inrCompact(rfm.winbackRevenue)} lifetime spend
          </h3>
          <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
            Repeat buyers (2+ orders) with no order in 90+ days, highest lifetime spend first — the
            first names to load into a WhatsApp win-back campaign. Recency measured from the latest
            order on file ({rfm.asOf}).{rfm.winbackTotal > rfm.winback.length ? ` Showing top ${rfm.winback.length}.` : ""}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-xs tabular">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="py-1 pr-4 font-medium">Customer</th>
                  <th className="py-1 pr-4 font-medium">Email</th>
                  <th className="py-1 pr-4 font-medium">Orders</th>
                  <th className="py-1 pr-4 font-medium">Lifetime spend</th>
                  <th className="py-1 pr-4 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody>
                {rfm.winback.map((c) => (
                  <tr key={c.email} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                    <td className="py-1.5 pr-4">{c.name || "—"}</td>
                    <td className="py-1.5 pr-4">{c.email}</td>
                    <td className="py-1.5 pr-4">{num(c.orders)}</td>
                    <td className="py-1.5 pr-4 font-semibold">{inr(c.lifetimeSpend)}</td>
                    <td className="py-1.5 pr-4">{c.lastOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-2xl font-semibold tabular">{unmatched.length}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>active creatives without an asset</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-semibold tabular">{fuzzy.length}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>fuzzy matches awaiting confirmation</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-semibold tabular">{orphanAssets.length}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Drive assets not linked to any ad</div>
        </div>
      </div>

      {assets.length === 0 && (
        <p className="card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          No Drive assets indexed yet — set <code>DRIVE_FOLDER_ID</code> and run <code>npm run index-drive</code>.
        </p>
      )}

      {fuzzy.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Confirm fuzzy matches</h3>
          <div className="flex flex-col gap-2">
            {fuzzy.map((c) => (
              <MatchActions key={c.ad_id} slug={slug} adId={c.ad_id} adName={c.ad_name}
                assetId={c.asset_id!} filename={c.asset_filename ?? ""} mode="confirm" />
            ))}
          </div>
        </div>
      )}

      {unmatched.length > 0 && assets.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Link manually ({unmatched.length} active ads unmatched)</h3>
          <div className="flex flex-col gap-2">
            {unmatched.slice(0, 30).map((c) => (
              <MatchActions key={c.ad_id} slug={slug} adId={c.ad_id} adName={`${c.ad_name} · ${inrCompact(c.spend)}`}
                mode="pick" assets={orphanAssets.map((a) => ({ id: String(a.id), filename: String(a.filename) }))} />
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Sync history</h3>
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="text-left" style={{ color: "var(--text-muted)" }}>
              <th className="py-1 pr-4 font-medium">When</th>
              <th className="py-1 pr-4 font-medium">Source</th>
              <th className="py-1 pr-4 font-medium">Rows</th>
              <th className="py-1 pr-4 font-medium">Anomalies</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const anomalies = Array.isArray(r.anomalies) ? r.anomalies as Array<{ kind: string; detail: string }> : [];
              return (
                <tr key={i} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                  <td className="py-1.5 pr-4">{String(r.ran_at).slice(0, 16)}</td>
                  <td className="py-1.5 pr-4">{r.source}</td>
                  <td className="py-1.5 pr-4">{r.rows_upserted}</td>
                  <td className="py-1.5 pr-4">
                    {anomalies.length === 0 ? "none" :
                      `${anomalies.length} — ${anomalies.slice(0, 2).map((a) => a.detail).join("; ")}${anomalies.length > 2 ? "…" : ""}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
