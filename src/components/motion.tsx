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
/**
 * Format a value the same way the animation will. Exported so the span can
 * be SERVER-RENDERED with its final text: previously the value was only ever
 * written in an effect, so every headline number shipped as an empty <span>
 * and appeared after hydration — invisible to anything reading the HTML, and
 * a blank hero on a slow connection.
 */
export function formatMetric(v: number, format: "inr-compact" | "inr" | "int" | "ratio" | "pct"): string {
  const fmtInr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const abs = Math.abs(v);
  switch (format) {
    case "inr-compact":
      return abs >= 1_00_00_000 ? `₹${(v / 1_00_00_000).toFixed(2)} Cr`
        : abs >= 1_00_000 ? `₹${(v / 1_00_000).toFixed(1)} L`
        : abs >= 1_000 ? `₹${(v / 1_000).toFixed(1)}k`
        : `₹${Math.round(v)}`;
    case "inr": return `₹${fmtInr.format(Math.round(v))}`;
    case "int": return fmtInr.format(Math.round(v));
    case "ratio": return v.toFixed(2);
    case "pct": return `${(v * 100).toFixed(1)}%`;
  }
}

export function AnimatedNumber({ value, format, className }: {
  value: number;
  format: "inr-compact" | "inr" | "int" | "ratio" | "pct";
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Start the spring AT the value, not at zero. The old version counted up
  // from 0 on mount, which is why the number had to be written in an effect
  // and shipped blank. Now the correct figure is in the HTML and stays put;
  // the spring only animates if the value actually changes.
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { duration: 1.1, bounce: 0 });

  useEffect(() => { mv.set(value); }, [value, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (v: number) => {
      if (ref.current) ref.current.textContent = formatMetric(v, format);
    });
    return unsub;
  }, [spring, format]);

  // children carry the final value so the server ships a real number; the
  // effects above overwrite textContent once motion takes over
  return <span ref={ref} className={className}>{formatMetric(value, format)}</span>;
}
