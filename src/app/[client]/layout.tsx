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
  { href: "/review", label: "Review" },
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
      {/* floating glass nav — no bar, three glass islands over the page */}
      <header className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto glass-chip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/organik-truck-logo.png" alt={client.name} className="h-8 w-auto rounded-full"
            style={{ background: "#ffffff", padding: "2px 6px" }} />
          <span className="serif-display hidden pr-2 text-lg leading-none sm:inline"
            style={{ color: "var(--text-primary)" }}>
            Organik Truck
          </span>
        </div>
        <div className="pointer-events-auto order-3 w-full sm:order-none sm:absolute sm:left-1/2 sm:w-auto sm:-translate-x-1/2">
          <Nav slug={slug} items={NAV} />
        </div>
        <div className="pointer-events-auto hidden lg:block">
          <SyncChip slug={slug} lastDay={lastDay} lastSync={syncRows[0]?.ran_at ?? null} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-32 sm:pt-24">
        {children}
      </div>

      <footer className="no-print border-t" style={{ borderColor: "var(--border-hairline)" }}>
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
