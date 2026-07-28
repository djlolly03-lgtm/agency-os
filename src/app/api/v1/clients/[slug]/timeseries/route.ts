import { getTimeseries } from "@/lib/queries";
import { withClient } from "../route-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const grain = (url.searchParams.get("grain") ?? "day") as "day" | "week" | "month";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = from && to ? { from, to } : undefined;
  return withClient(slug, (id) => getTimeseries(id, grain, range));
}
