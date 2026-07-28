import { NextResponse } from "next/server";
import { getGoals, setGoal, latestDay } from "@/lib/queries";
import { withClient } from "../route-helpers";

/** GET current-month goals; POST { metric, target, month? } to set one. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withClient(slug, async (id) => {
    const today = await latestDay(id);
    const month = today.slice(0, 7) + "-01";
    return { month, goals: await getGoals(id, month) };
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json()) as { metric?: string; target?: number; month?: string };
  if (!body.metric || !["spend", "revenue", "orders", "roas"].includes(body.metric) ||
      typeof body.target !== "number" || !(body.target >= 0)) {
    return NextResponse.json({ error: "metric (spend|revenue|orders|roas) and target >= 0 required" }, { status: 400 });
  }
  return withClient(slug, async (id) => {
    const month = body.month ?? (await latestDay(id)).slice(0, 7) + "-01";
    await setGoal(id, month, body.metric!, body.target!);
    return { ok: true, month };
  });
}
