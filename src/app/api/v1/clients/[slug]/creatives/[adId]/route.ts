import { getCreativeDaily } from "@/lib/queries";
import { withClient } from "../../route-helpers";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; adId: string }> }) {
  const { slug, adId } = await params;
  return withClient(slug, () => getCreativeDaily(adId));
}
