"use client";

import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { inrCompact, ratio } from "@/lib/format";

type Point = {
  id: string; name: string; platform: string;
  spend: number; revenue: number; roas: number; purchases: number;
};

/**
 * Performance quadrants: spend (x, log-ish) vs ROAS (y), bubble = revenue.
 * Reference lines at account ROAS and median spend split the four quadrants.
 * Click a bubble → campaign detail.
 */
export function CampaignScatter({ points, accountRoas, slug }: {
  points: Point[]; accountRoas: number; slug: string;
}) {
  const router = useRouter();
  const data = points.filter((p) => p.spend > 0).map((p) => ({ ...p, z: Math.max(p.revenue, 1) }));
  const spends = data.map((p) => p.spend).sort((a, b) => a - b);
  const medianSpend = spends.length ? spends[Math.floor(spends.length / 2)] : 0;

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Performance quadrants</h3>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          bubble size = revenue · lines = account ROAS ({ratio(accountRoas)}×) & median spend
        </span>
      </div>
      <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        Top-right = scale · top-left = feed more budget · bottom-right = fix or pause · click any bubble.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis
            dataKey="spend" type="number" name="Spend" scale="sqrt" domain={[0, "dataMax"]}
            tickFormatter={(v: number) => inrCompact(v)}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }} tickLine={false}
          />
          <YAxis
            dataKey="roas" type="number" name="ROAS" domain={[0, "auto"]}
            tickFormatter={(v: number) => `${ratio(v, 1)}×`}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false} tickLine={false} width={44}
          />
          <ZAxis dataKey="z" range={[40, 900]} />
          <ReferenceLine y={accountRoas} stroke="var(--baseline)" strokeDasharray="4 4" />
          <ReferenceLine x={medianSpend} stroke="var(--baseline)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--baseline)" }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as Point | undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border px-3 py-2 text-xs"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-card)" }}>
                  <div className="mb-1 max-w-56 font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                  <div className="tabular" style={{ color: "var(--text-secondary)" }}>
                    {p.platform === "meta" ? "Meta" : "Google"} · {inrCompact(p.spend)} spend · {inrCompact(p.revenue)} rev · {ratio(p.roas)}× ROAS
                  </div>
                  <div className="mt-1" style={{ color: "var(--brand)" }}>Click to open →</div>
                </div>
              );
            }}
          />
          <Scatter
            data={data.filter((d) => d.platform === "meta")}
            fill="var(--series-1)" fillOpacity={0.75} stroke="var(--surface-1)"
            onClick={(e) => { const p = e as unknown as Point; if (p?.id) router.push(`/${slug}/campaigns/${p.id}`); }}
            cursor="pointer"
          />
          <Scatter
            data={data.filter((d) => d.platform === "google")}
            fill="var(--series-2)" fillOpacity={0.75} stroke="var(--surface-1)"
            onClick={(e) => { const p = e as unknown as Point; if (p?.id) router.push(`/${slug}/campaigns/${p.id}`); }}
            cursor="pointer"
          />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-1)" }} />Meta</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-2)" }} />Google</span>
      </div>
    </div>
  );
}
