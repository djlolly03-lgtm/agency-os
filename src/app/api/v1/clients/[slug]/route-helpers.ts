import { NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/queries";

export async function withClient(
  slug: string,
  fn: (clientId: string) => Promise<unknown>
) {
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });
  try {
    const data = await fn(client.id);
    return NextResponse.json({ data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
