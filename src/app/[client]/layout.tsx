import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug } from "@/lib/queries";

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

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/organik-truck-logo.png" alt={client.name} className="h-10 w-auto rounded-md"
            style={{ background: "#ffffff", padding: "2px 6px" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Growth dashboard · {client.currency}
          </span>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={`/${slug}${n.href}`}
              className="rounded-md px-3 py-1.5 hover:underline"
              style={{ color: "var(--text-secondary)" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-12 flex items-center justify-between gap-3 border-t pt-4"
        style={{ borderColor: "var(--border-hairline)" }}>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Prepared for {client.name} · data refreshed daily from ad platforms
        </span>
        <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Powered by
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pixel-mint-media-logo.png" alt="Pixel Mint Media" className="h-12 w-auto rounded-md"
            style={{ background: "#ffffff", padding: "4px 10px" }} />
        </span>
      </footer>
    </div>
  );
}
