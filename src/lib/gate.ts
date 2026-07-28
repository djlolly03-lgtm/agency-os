/**
 * Interim site-wide password gate (until real client logins ship).
 * Cookie stores sha256(SITE_PASSWORD) — never the password itself.
 * Works in both edge (middleware) and node runtimes via Web Crypto.
 */
export const GATE_COOKIE = "agency_gate";

export async function gateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`agency-os:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
