/** Interim password gate — replaced by real client logins in the auth phase. */
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <form method="POST" action="/api/gate" className="card flex w-full max-w-sm flex-col gap-4 p-8">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/organik-truck-logo.png" alt="Organik Truck" className="h-12 w-auto rounded-md"
            style={{ background: "#ffffff", padding: "3px 8px" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Growth dashboard</p>
        </div>
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <label className="flex flex-col gap-1.5 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Password</span>
          <input
            type="password" name="password" required autoFocus
            className="rounded-md border px-3 py-2"
            style={{ borderColor: "var(--border-hairline)", background: "var(--page)" }}
          />
        </label>
        {sp.error && (
          <p className="text-xs" style={{ color: "var(--status-critical)" }}>Wrong password — try again.</p>
        )}
        <button
          type="submit"
          className="rounded-md px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          Enter
        </button>
      </form>
      <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        Powered by
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pixel-mint-media-logo.png" alt="Pixel Mint Media" className="h-12 w-auto rounded-md"
          style={{ background: "#ffffff", padding: "4px 10px" }} />
      </span>
    </div>
  );
}
