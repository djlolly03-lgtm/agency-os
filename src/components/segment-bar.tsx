import { pct } from "@/lib/format";

/**
 * One cohesive segmented bar — flat segments inside a single rounded
 * container, hairline surface gaps between them, labels inside when
 * there's room. Width animates in via CSS (no JS).
 */
export function SegmentBar({ segments, height = 36 }: {
  segments: Array<{ label: string; value: number; color: string; sub?: string }>;
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-xl" style={{ height, background: "var(--grid)" }}>
      {segments.map((s, i) => {
        const share = s.value / total;
        const wide = share > 0.18;
        return (
          <div key={i}
            className="seg-grow relative flex items-center overflow-hidden px-3"
            style={{
              ["--w" as string]: `${share * 100}%`,
              background: s.color,
              animationDelay: `${i * 120}ms`,
              minWidth: share > 0 ? 26 : 0,
              borderRight: i < segments.length - 1 ? "2px solid var(--surface-1)" : "none",
            }}
            title={`${s.label} · ${pct(share, 0)}${s.sub ? ` · ${s.sub}` : ""}`}>
            {wide ? (
              <span className="whitespace-nowrap text-xs font-bold text-white">
                {s.label} · {pct(share, 0)}{s.sub ? ` · ${s.sub}` : ""}
              </span>
            ) : share > 0.04 ? (
              <span className="whitespace-nowrap text-[11px] font-bold text-white">{pct(share, 0)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
