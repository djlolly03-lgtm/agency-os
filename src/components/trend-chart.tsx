"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { inrCompact, ratio, dayLabel, monthLabel } from "@/lib/format";

type Row = { period: string; platform: string; spend: number; revenue: number; purchases: number };
type Grain = "day" | "week" | "month";
type Metric = "spend" | "revenue" | "roas";

const SERIES: Record<string, string> = {
  meta: "var(--series-1)",
  google: "var(--series-2)",
};

export function TrendChart({ daily, weekly, monthly, defaultGrain = "week", defaultMetric = "spend" }: {
  daily: Row[]; weekly: Row[]; monthly: Row[]; defaultGrain?: Grain; defaultMetric?: Metric;
}) {
  const [grain, setGrain] = useState<Grain>(defaultGrain);
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const source = grain === "day" ? daily : grain === "week" ? weekly : monthly;

  const data = useMemo(() => {
    const byPeriod = new Map<string, { period: string; meta: number; google: number }>();
    for (const r of source) {
      if (!byPeriod.has(r.period)) byPeriod.set(r.period, { period: r.period, meta: 0, google: 0 });
      const row = byPeriod.get(r.period)!;
      const v = metric === "roas"
        ? 0 // filled after
        : r[metric];
      if (metric === "roas") {
        // accumulate spend/revenue then divide below
      } else if (r.platform === "meta") row.meta += v;
      else if (r.platform === "google") row.google += v;
    }
    if (metric === "roas") {
      const acc = new Map<string, { ms: number; mr: number; gs: number; gr: number }>();
      for (const r of source) {
        if (!acc.has(r.period)) acc.set(r.period, { ms: 0, mr: 0, gs: 0, gr: 0 });
        const a = acc.get(r.period)!;
        if (r.platform === "meta") { a.ms += r.spend; a.mr += r.revenue; }
        else { a.gs += r.spend; a.gr += r.revenue; }
      }
      for (const [p, a] of acc) {
        const row = byPeriod.get(p)!;
        row.meta = a.ms > 0 ? a.mr / a.ms : 0;
        row.google = a.gs > 0 ? a.gr / a.gs : 0;
      }
    }
    // hide zero-google periods early on (no google data before May '26)
    return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
  }, [source, metric]);

  const fmtVal = (v: number) => (metric === "roas" ? ratio(v) : inrCompact(v));
  const fmtPeriod = (p: string) => (grain === "month" ? monthLabel(p.slice(0, 7)) : dayLabel(p));
  // limit day view to trailing 60 days so marks stay readable
  const visible = grain === "day" ? data.slice(-60) : data;

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Performance trend</h3>
        <div className="flex gap-1 text-xs">
          {(["spend", "revenue", "roas"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="rounded-md border px-2 py-1 capitalize"
              style={{
                borderColor: "var(--border-hairline)",
                background: metric === m ? "var(--grid)" : "transparent",
                fontWeight: metric === m ? 600 : 400,
              }}
            >
              {m === "roas" ? "ROAS" : m}
            </button>
          ))}
          <span className="mx-1" />
          {(["day", "week", "month"] as Grain[]).map((g) => (
            <button
              key={g}
              onClick={() => setGrain(g)}
              className="rounded-md border px-2 py-1 capitalize"
              style={{
                borderColor: "var(--border-hairline)",
                background: grain === g ? "var(--grid)" : "transparent",
                fontWeight: grain === g ? 600 : 400,
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={visible} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="period"
            tickFormatter={fmtPeriod}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={fmtVal}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(v: unknown, name: unknown) => [fmtVal(Number(v)), name === "meta" ? "Meta" : "Google"]}
            labelFormatter={(l: unknown) => fmtPeriod(String(l))}
            contentStyle={{
              background: "var(--surface-1)", border: "1px solid var(--border-hairline)",
              borderRadius: 8, color: "var(--text-primary)", fontSize: 12,
            }}
            cursor={{ stroke: "var(--baseline)" }}
          />
          <Legend
            formatter={(v) => (
              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v === "meta" ? "Meta" : "Google"}</span>
            )}
          />
          {metric === "roas" ? (
            <>
              <Line dataKey="meta" stroke={SERIES.meta} strokeWidth={2} dot={false} type="monotone" />
              <Line dataKey="google" stroke={SERIES.google} strokeWidth={2} dot={false} type="monotone" />
            </>
          ) : (
            <>
              <Bar dataKey="meta" stackId="p" fill={SERIES.meta} stroke="var(--surface-1)" strokeWidth={1} radius={[0, 0, 0, 0]} />
              <Bar dataKey="google" stackId="p" fill={SERIES.google} stroke="var(--surface-1)" strokeWidth={1} radius={[4, 4, 0, 0]} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
