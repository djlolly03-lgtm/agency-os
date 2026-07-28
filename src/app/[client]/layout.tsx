import { notFound } from "next/navigation";
import { getClientBySlug, latestDay } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { Nav } from "@/components/nav";
import { SyncChip } from "@/components/sync-chip";

const NAV = [
  { href: "", label: "Overview" },
  { href: "/creatives", label: "Creatives" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/platforms", label: "Platforms" },
  { href: "/monthly", label: "Monthly report" },
  { href: "/internal", label: "Internal" },
];

export default async function ClientLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ client: string }>;
}) {
  const { client: slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const db = await getDb();
  const [lastDay, syncRows] = await Promise.all([
    latestDay(client.id),
    db.query<{ ran_at: string }>(
      `select ran_at::text as ran_at from sync_runs where client_id = $1 order by ran_at desc limit 1`,
      [client.id]),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b"
        style={{
          background: "color-mix(in srgb, var(--page) 82%, transparent)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          borderColor: "var(--border-hairline)",
        }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/organik-truck-logo.png" alt={client.name} className="h-9 w-auto rounded-md"
              style={{ background: "#ffffff", padding: "2px 6px" }} />
            <SyncChip slug={slug} lastDay={lastDay} lastSync={syncRows[0]?.ran_at ?? null} />
          </div>
          <Nav slug={slug} items={NAV} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-5">
        {children}
      </div>

      <footer className="border-t" style={{ borderColor: "var(--border-hairline)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Prepared for {client.name} · data refreshed daily from ad platforms
          </span>
          <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Powered by
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pixel-mint-media-logo.png" alt="Pixel Mint Media" className="h-12 w-auto rounded-md"
              style={{ background: "#ffffff", padding: "4px 10px" }} />
          </span>
        </div>
      </footer>
    </div>
  );
}
