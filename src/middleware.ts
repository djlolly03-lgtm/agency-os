import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { GATE_COOKIE, gateToken } from "@/lib/gate";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Site-wide password gate (interim, until real logins).
  // /api/v1/sync stays reachable — it has its own Bearer secret (cron).
  const gateExempt =
    pathname === "/gate" || pathname === "/api/gate" || pathname === "/api/v1/sync";
  const password = process.env.SITE_PASSWORD;
  if (password && !gateExempt) {
    const cookie = request.cookies.get(GATE_COOKIE)?.value;
    if (cookie !== (await gateToken(password))) {
      const gateUrl = request.nextUrl.clone();
      gateUrl.pathname = "/gate";
      gateUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(gateUrl);
    }
  }

  return updateSession(request);
}

export const config = {
  // Skip static assets; everything else (pages + APIs) passes through the gate.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
