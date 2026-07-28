import { pct } from "@/lib/format";

/**
 * Chunky animated segment bar — labels live inside the segments,
 * width animates in via CSS (no JS).
 */
export function SegmentBar({ segments, height = 34 }: {
  segments: Array<{ label: string; value: number; color: string; sub?: string }>;
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex w-full gap-1 overflow-hidden rounded-xl" style={{ height }}>
      {segments.map((s, i) => {
        const share = s.value / total;
        const wide = share > 0.16;
        return (
          <div key={i} className="seg-grow relative flex items-center overflow-hidden rounded-lg px-3"
            style={{ ["--w" as string]: `${share * 100}%`, background: s.color, animationDelay: `${i * 120}ms`, minWidth: share > 0 ? 22 : 0 }}
            title={`${s.label} · ${pct(share, 0)}`}>
            {wide && (
              <span className="whitespace-nowrap text-xs font-semibold text-white">
                {s.label} · {pct(share, 0)}{s.sub ? ` · ${s.sub}` : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
