import { NextResponse } from "next/server";
import { getReviewNotes, setReviewNote, REVIEW_SECTIONS } from "@/lib/queries";
import { withClient } from "../route-helpers";

const ALLOWED = new Set<string>([
  ...REVIEW_SECTIONS.map((s) => s.key),
  "commitments",   // JSON array of {text, owner, due, proof, status}
  "next_month",    // legacy prose plan from before the decision-memo layout
]);
const MAX_BODY = 8000;   // commitments ride as JSON — needs more headroom than prose

/** GET ?month=YYYY-MM-01 → that month's narrative sections; POST { month, section, body } to save. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const month = new URL(req.url).searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: "month (YYYY-MM-01) required" }, { status: 400 });
  }
  return withClient(slug, (id) => getReviewNotes(id, month));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json()) as { month?: string; section?: string; body?: string };
  if (!body.month || !/^\d{4}-\d{2}-01$/.test(body.month) || !body.section || !ALLOWED.has(body.section)
      || typeof body.body !== "string" || body.body.length > MAX_BODY) {
    return NextResponse.json({
      error: `month (YYYY-MM-01), section (${[...ALLOWED].join("|")}), body (string, max ${MAX_BODY} chars) required`,
    }, { status: 400 });
  }
  return withClient(slug, async (id) => {
    await setReviewNote(id, body.month!, body.section!, body.body!);
    return { ok: true };
  });
}
