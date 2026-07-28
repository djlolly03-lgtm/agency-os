"use client";

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { inrCompact, ratio, dayLabel } from "@/lib/format";

type Row = { day: string; spend: number; revenue: number; roas: number };

/**
 * Spend and revenue share one ₹ scale (single axis — never dual).
 * ROAS gets its own small chart below rather than a second y-axis.
 */
export function CreativeDailyChart({ rows }: { rows: Row[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Daily spend vs revenue</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--baseline)" }} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={inrCompact} tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={false} tickLine={false} width={56} />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [inrCompact(Number(v)), name === "spend" ? "Spend" : "Revenue"]}
              labelFormatter={(l: unknown) => dayLabel(String(l))}
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
              cursor={{ stroke: "var(--baseline)" }}
            />
            <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v === "spend" ? "Spend" : "Revenue"}</span>} />
            <Bar dataKey="spend" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={1} radius={[4, 4, 0, 0]} />
            <Line dataKey="revenue" stroke="var(--series-3)" strokeWidth={2} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Daily ROAS</h3>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--baseline)" }} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={(v: number) => ratio(v, 1)} tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              axisLine={false} tickLine={false} width={56} />
            <Tooltip
              formatter={(v: unknown) => [ratio(Number(v)), "ROAS"]}
              labelFormatter={(l: unknown) => dayLabel(String(l))}
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
              cursor={{ stroke: "var(--baseline)" }}
            />
            <Line dataKey="roas" stroke="var(--series-1)" strokeWidth={2} dot={false} type="monotone" name="ROAS" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
