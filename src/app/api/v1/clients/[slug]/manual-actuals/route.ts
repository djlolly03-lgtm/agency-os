import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withClient } from "../route-helpers";

const ALLOWED = new Set([
  "offline_revenue", "ltv_fruits_veggies", "ltv_groceries",
  "total_revenue", "total_orders", "new_customers", "returning_customers",
]);

/** GET ?month=YYYY-MM-01 → that month's manual inputs; POST { month, metric, value } to set. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const month = new URL(req.url).searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });
  return withClient(slug, async (id) => {
    const db = await getDb();
    return db.query(
      `select metric, value, source, updated_at from manual_actuals
       where client_id = $1 and month = $2 order by metric`, [id, month]);
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json()) as { month?: string; metric?: string; value?: number };
  if (!body.month || !/^\d{4}-\d{2}-01$/.test(body.month) || !body.metric || !ALLOWED.has(body.metric)
      || typeof body.value !== "number" || !(body.value >= 0)) {
    return NextResponse.json({ error: `month (YYYY-MM-01), metric (${[...ALLOWED].join("|")}), value >= 0 required` }, { status: 400 });
  }
  return withClient(slug, async (id) => {
    const db = await getDb();
    await db.query(
      `insert into manual_actuals (client_id, month, metric, value, source)
       values ($1,$2,$3,$4,'internal_ui')
       on conflict (client_id, month, metric) do update
         set value = excluded.value, source = excluded.source, updated_at = now()`,
      [id, body.month, body.metric, body.value]);
    return { ok: true };
  });
}
