import Link from "next/link";
import { dayLabel } from "@/lib/format";

/**
 * Live data-lineage chip: where the numbers come from and how fresh they are.
 * Sheets → Supabase → this dashboard. Links to the Internal sync history.
 */
export function SyncChip({ slug, lastDay, lastSync }: {
  slug: string; lastDay: string; lastSync: string | null;
}) {
  return (
    <Link href={`/${slug}/internal`} className="chip transition-colors hover:brightness-110"
      title={lastSync ? `Last sync ${lastSync}` : "Sync history"}>
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: "var(--status-good)" }} />
        <span className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: "var(--status-good)" }} />
      </span>
      <span style={{ color: "var(--text-secondary)" }}>
        Sheets → Supabase · data through <strong style={{ color: "var(--text-primary)" }}>{dayLabel(lastDay)}</strong>
      </span>
    </Link>
  );
}
