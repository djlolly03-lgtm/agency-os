import { getCreatives } from "@/lib/queries";
import { withClient } from "../route-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const format = url.searchParams.get("format");
  const search = url.searchParams.get("search")?.toLowerCase();
  const activeOnly = url.searchParams.get("active") === "true";
  const sort = url.searchParams.get("sort") ?? "-spend";

  return withClient(slug, async (id) => {
    let rows = await getCreatives(id);
    if (status) rows = rows.filter((r) => r.status === status);
    if (format) rows = rows.filter((r) => r.format === format);
    if (activeOnly) rows = rows.filter((r) => r.active);
    if (search) rows = rows.filter((r) =>
      r.ad_name.toLowerCase().includes(search) ||
      r.campaign.toLowerCase().includes(search) ||
      r.ad_set.toLowerCase().includes(search));
    const key = sort.replace(/^-/, "") as keyof typeof rows[number];
    const dir = sort.startsWith("-") ? -1 : 1;
    rows.sort((a, b) => dir * ((Number(a[key]) || 0) - (Number(b[key]) || 0)));
    return rows;
  });
}
