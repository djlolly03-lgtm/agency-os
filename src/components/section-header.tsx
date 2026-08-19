/**
 * Narrative act header — numbered eyebrow + serif display title, outside the cards.
 *
 * `scope` is not decoration: roughly half the acts on the Overview answer to the
 * month picker and half are all-history by nature (cohorts, growth, segments).
 * Without a marker, switching to Feb '26 silently leaves those acts on all-time
 * data and the reader has no way to tell. Every act states its own scope.
 */
export function SectionHeader({ eyebrow, title, meta, index, scope }: {
  eyebrow: string; title: string; meta?: string; index?: string;
  /** e.g. "Jul 2026" for month-scoped acts, "All time" for history-wide ones */
  scope?: string;
}) {
  return (
    <div className="act">
      <span className="act-eyebrow">
        {index ? `${index} · ${eyebrow}` : eyebrow}
        {scope && (
          <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: "color-mix(in srgb, var(--text-muted) 14%, transparent)",
              color: "var(--text-muted)", letterSpacing: "0.08em",
            }}>
            {scope}
          </span>
        )}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="act-title">{title}</h2>
        {meta && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{meta}</span>}
      </div>
    </div>
  );
}
