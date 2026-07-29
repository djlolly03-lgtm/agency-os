"use client";

import { useEffect, useRef, useState } from "react";

const SPOTLIGHT_R = 260;

/**
 * Full-bleed cinematic hero stage. A cursor-following spotlight (soft radial
 * mask, rAF-lerped at 0.1) uncovers the "lit" layer: brighter atmosphere plus
 * the month's daily revenue skyline — move the light, reveal the data.
 * Falls back to a slow autonomous drift on touch devices / until first move.
 */
export function HeroCinema({ skyline, children }: {
  /** daily revenue values for the selected period — drawn as the buried data field */
  skyline: number[];
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
      style={{ minHeight: "100dvh", ["--spot-r" as string]: `${SPOTLIGHT_R}px` }}
    >
      {/* dormant field (Ken Burns settle-in) */}
      <div className="cinema-base hero-zoom" />
      <SkylineField values={skyline} lit={false} />
      {/* the lit layer the spotlight uncovers */}
      <div className={`cinema-lit ${tracking ? "" : "cinema-drift"}`}>
        <SkylineField values={skyline} lit />
      </div>
      {/* content */}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-4">
        {children}
      </div>
    </section>
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
