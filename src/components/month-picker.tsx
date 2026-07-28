import Link from "next/link";
import { monthLabel } from "@/lib/format";

/** Month chips (newest first data → rendered oldest→newest). */
export function MonthPicker({ months, selected, basePath }: {
  months: string[]; selected: string; basePath: string;
}) {
  const ordered = [...months].sort();
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {ordered.map((m) => (
        <Link key={m} href={`${basePath}?month=${m.slice(0, 7)}`}
          className="rounded-full border px-2.5 py-1"
          style={{
            borderColor: "var(--border-hairline)",
            background: selected === m ? "var(--brand)" : "transparent",
            color: selected === m ? "#ffffff" : "var(--text-secondary)",
            fontWeight: selected === m ? 600 : 400,
          }}>
          {monthLabel(m.slice(0, 7))}
        </Link>
      ))}
    </div>
  );
}
