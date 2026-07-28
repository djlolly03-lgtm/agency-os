/** Narrative act header — eyebrow + display title, outside the cards. */
export function SectionHeader({ eyebrow, title, meta }: {
  eyebrow: string; title: string; meta?: string;
}) {
  return (
    <div className="act">
      <span className="act-eyebrow">{eyebrow}</span>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="act-title">{title}</h2>
        {meta && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{meta}</span>}
      </div>
    </div>
  );
}
