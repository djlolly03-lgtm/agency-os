import { NextResponse } from "next/server";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const expected = process.env.SITE_PASSWORD;
  const url = new URL(req.url);

  // only allow same-site relative redirects
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!expected || password !== expected) {
    return NextResponse.redirect(new URL(`/gate?error=1&next=${encodeURIComponent(safeNext)}`, url.origin), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, url.origin), 303);
  res.cookies.set(GATE_COOKIE, await gateToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
