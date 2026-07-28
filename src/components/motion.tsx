"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * True when the document is hidden at mount (background tab, headless
 * export, print). rAF is suspended there, so JS-driven animations would
 * leave content invisible — render the final state immediately instead.
 */
function useSkipAnimation() {
  const [skip] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  return skip;
}

/** Section that fades + rises in on mount (instant when tab is hidden). */
export function FadeIn({ children, delay = 0, className }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const skip = useSkipAnimation();
  return (
    <motion.div
      className={className}
      // hidden-tab loads render final state; SSR emits the pre-animation state,
      // framer patches imperatively on mount — suppress the benign dev warning
      suppressHydrationWarning
      initial={skip ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={skip ? { duration: 0 } : { duration: 0.5, delay, ease: [0.21, 0.65, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Number that counts up on mount (instant when tab is hidden). */
export function AnimatedNumber({ value, format, className }: {
  value: number;
  format: "inr-compact" | "inr" | "int" | "ratio" | "pct";
  className?: string;
}) {
  const skip = useSkipAnimation();
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: 1.1, bounce: 0 });

  useEffect(() => {
    if (skip) return;
    const t = setTimeout(() => mv.set(value), 80);
    return () => clearTimeout(t);
  }, [value, mv, skip]);

  useEffect(() => {
    const fmtInr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
    const render = (v: number) => {
      if (!ref.current) return;
      let out: string;
      switch (format) {
        case "inr-compact": {
          const abs = Math.abs(v);
          out = abs >= 1_00_00_000 ? `₹${(v / 1_00_00_000).toFixed(2)} Cr`
            : abs >= 1_00_000 ? `₹${(v / 1_00_000).toFixed(1)} L`
            : abs >= 1_000 ? `₹${(v / 1_000).toFixed(1)}k`
            : `₹${Math.round(v)}`;
          break;
        }
        case "inr": out = `₹${fmtInr.format(Math.round(v))}`; break;
        case "int": out = fmtInr.format(Math.round(v)); break;
        case "ratio": out = v.toFixed(2); break;
        case "pct": out = `${(v * 100).toFixed(1)}%`; break;
      }
      ref.current.textContent = out;
    };
    render(skip ? value : 0);
    const unsub = spring.on("change", render);
    return unsub;
  }, [spring, format, skip, value]);

  return <span ref={ref} className={className} />;
}
