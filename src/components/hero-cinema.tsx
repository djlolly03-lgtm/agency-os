"use client";

import { useEffect, useRef, useState } from "react";

const SPOTLIGHT_R = 260;

/**
 * Full-bleed cinematic hero stage. A cursor-following spotlight (soft radial
 * mask, rAF-lerped at 0.1) uncovers the "lit" layer: brighter atmosphere plus
 * the month's daily revenue skyline — move the light, reveal the data.
 * Falls back to a slow autonomous drift on touch devices / until first move.
 */
export function HeroCinema({ skyline, minHeight = "100dvh", children }: {
  /** daily revenue values for the selected period — drawn as the buried data field */
  skyline: number[];
  minHeight?: string;
  children: React.ReactNode;
}) {
  const stageRef = useRef<HTMLElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  const smooth = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect();
      mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (smooth.current.x < -999) smooth.current = { ...mouse.current };
      setTracking(true);
    };
    stage.addEventListener("mousemove", onMove);

    const tick = () => {
      if (mouse.current.x > -999) {
        smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1;
        smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1;
        const r = stage.getBoundingClientRect();
        stage.style.setProperty("--spot-x", `${((smooth.current.x / Math.max(r.width, 1)) * 100).toFixed(2)}%`);
        stage.style.setProperty("--spot-y", `${((smooth.current.y / Math.max(r.height, 1)) * 100).toFixed(2)}%`);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      stage.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <section
      ref={stageRef}
      className="cinema"
      style={{ minHeight, ["--spot-r" as string]: `${SPOTLIGHT_R}px` }}
    >
      {/* dormant field (Ken Burns settle-in) */}
      <div className="cinema-base hero-zoom" />
      <SkylineField values={skyline} lit={false} />
      {/* the lit layer the spotlight uncovers */}
      <div className={`cinema-lit ${tracking ? "" : "cinema-drift"}`}>
        <SkylineField values={skyline} lit />
      </div>
      {/* content */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-4" style={{ minHeight }}>
        {children}
      </div>
    </section>
  );
}

/**
 * Page-top cinema banner: the hero's language at section scale. Serif+sans
 * two-line title, sub-line, right-aligned stat slot, spotlight + skyline —
 * every page opens like the cover, then gets to work.
 */
export function CinemaBanner({ eyebrow, line1, line2, sub, skyline = [], stats }: {
  eyebrow?: string;
  line1: string;
  line2: string;
  sub?: React.ReactNode;
  /** optional data field buried in the dark (e.g. per-campaign spend) */
  skyline?: number[];
  /** right-aligned stat block(s) */
  stats?: React.ReactNode;
}) {
  return (
    <div className="-mt-32 sm:-mt-24">
      <HeroCinema skyline={skyline} minHeight="46vh">
        <div className="flex flex-col justify-end pb-8 pt-28" style={{ minHeight: "46vh" }}>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div>
              {eyebrow && (
                <div className="hero-anim hero-fade text-[11px] font-bold uppercase tracking-[0.18em]"
                  style={{ animationDelay: "0.15s", color: "#7ff0d8" }}>
                  {eyebrow}
                </div>
              )}
              <h1 className="cinema-h1 mt-2 text-4xl sm:text-5xl md:text-6xl">
                <span className="line-serif hero-anim hero-reveal" style={{ animationDelay: "0.25s" }}>{line1}</span>
                <span className="line-sans hero-anim hero-reveal" style={{ animationDelay: "0.4s" }}>{line2}</span>
              </h1>
              {sub && (
                <p className="hero-anim hero-fade mt-3 max-w-xl text-xs sm:text-sm"
                  style={{ animationDelay: "0.6s", color: "rgba(255,255,255,0.65)" }}>
                  {sub}
                </p>
              )}
            </div>
            {stats && (
              <div className="hero-anim hero-fade flex flex-wrap items-end gap-x-8 gap-y-4"
                style={{ animationDelay: "0.7s" }}>
                {stats}
              </div>
            )}
          </div>
        </div>
      </HeroCinema>
    </div>
  );
}

/** Big-number stat for CinemaBanner's right slot. */
export function BannerStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="num-gradient mt-0.5 text-3xl font-bold tabular md:text-4xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

/**
 * Cursor-glow wrapper for dark stages — the hero's spotlight feel on any
 * card: a soft teal light follows the pointer while hovering.
 */
export function SpotlightStage({ children, radius = 20 }: {
  children: React.ReactNode;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMove} className="spot-stage relative">
      {children}
      <div className="spot-glow" style={{ borderRadius: radius }} aria-hidden />
    </div>
  );
}

/**
 * The buried data field: the period's daily revenue as thin light columns
 * rising from the stage floor. Nearly invisible dormant; vivid when lit.
 */
function SkylineField({ values, lit }: { values: number[]; lit: boolean }) {
  if (values.length < 2) return null;
  const W = 1200, H = 400;
  const max = Math.max(...values, 1);
  const gap = W / values.length;
  const bw = Math.min(Math.max(gap * 0.42, 3), 26);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-x-0 bottom-0 h-[46%] w-full"
      style={{ pointerEvents: "none", opacity: lit ? 0.9 : 0.13 }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`sky-${lit ? "lit" : "dim"}`} x1="0" y1="1" x2="0" y2="0">
          {lit ? (
            <>
              <stop offset="0%" stopColor="#17b39a" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#7ff0d8" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#d8fff5" stopOpacity="0.95" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#17b39a" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#17b39a" stopOpacity="0.15" />
            </>
          )}
        </linearGradient>
      </defs>
      {values.map((v, i) => {
        const h = Math.max((v / max) * (H * 0.86), 4);
        const x = gap * i + (gap - bw) / 2;
        return (
          <rect key={i} x={x} y={H - h} width={bw} height={h} rx={bw / 2.5}
            fill={`url(#sky-${lit ? "lit" : "dim"})`} />
        );
      })}
      {/* baseline glow when lit */}
      {lit && <rect x="0" y={H - 2} width={W} height="2" fill="#7ff0d8" opacity="0.5" />}
    </svg>
  );
}
