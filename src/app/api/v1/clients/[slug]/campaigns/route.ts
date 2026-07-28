import { getCampaigns } from "@/lib/queries";
import { withClient } from "../route-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = from && to ? { from, to } : undefined;
  return withClient(slug, (id) => getCampaigns(id, range));
}
