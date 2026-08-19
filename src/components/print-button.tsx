"use client";

import { Printer } from "lucide-react";

/**
 * Browser print dialog → "Save as PDF" gives a client-ready document.
 * No PDF library: the print stylesheet already lays the page out for A4,
 * and the browser's own engine handles fonts, page breaks and vectors
 * better than a headless renderer would.
 */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-transform hover:scale-105"
      style={{ background: "var(--brand)", color: "#ffffff" }}
      title="Print, or save as PDF"
    >
      <Printer size={13} /> Save as PDF
    </button>
  );
}
