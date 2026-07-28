import { getMonthlyReport } from "@/lib/queries";
import { withClient } from "../route-helpers";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return withClient(slug, (id) => getMonthlyReport(id));
}
