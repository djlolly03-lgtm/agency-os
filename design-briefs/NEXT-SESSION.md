# Queued work — picked up next session

## 1. Period views + growth visualization (user ask, not yet built)
Month tabs exist, but no **Quarter / 6-month / Yearly / All-time** views.
Build a period selector that extends the current month picker (e.g. chips: months … | Q1'26 | Q2'26 | H1'26 | FY | All), and a dedicated **growth story visual**:
- MoM growth bars (revenue) with % growth labels — the "up and to the right" chart
- Cumulative revenue curve (running total since Nov 2025)
- QoQ comparison cards (Q1 vs Q2: revenue, ROAS, orders, CAC with deltas)
- Growth insight cards ("Revenue grew 7.9× from Nov to Jun", CAGR-style monthly growth rate)
All month-scoped logic (hero, insights, divisions, funnel) should accept a date range,
not just a month — most queries already take {from,to}.

## 2. Motionsites-style visual overhaul (user supplied a full brief)
User verbatim: "use this to build the look and feel, data stays as is, brand is
organik truck, powered by PMM doesn't change" and standing critique: "your
visualization is lacking the feeling of a 100M agency".
Full original prompt saved at: `design-briefs/motionsites-hero-brief.md`.
Key elements to adapt (Lithos → Organik Truck):
- Fonts: **Inter** (body/UI) + **Playfair Display italic** (display accent) via Google Fonts
- Full-screen dark hero (100dvh) with layered z-index composition
- **Cursor-following spotlight** that reveals a second layer through a soft radial
  canvas mask (SPOTLIGHT_R=260, rAF lerp 0.1 smoothing, gradient stops
  1/1/.75/.4/.12/0 at 0/.4/.6/.75/.88/1) — adapt: spotlight could reveal a
  data layer / produce imagery instead of geology images
- Two-line display headline: line 1 Playfair italic (-0.05em), line 2 Inter (-0.08em),
  text-5xl→sm:7xl→md:8xl, staggered blur-rise entrance (heroReveal keyframes
  0.25s/0.42s delays), Ken Burns zoom on base layer (heroZoom 1.8s)
- Bottom-left + bottom-right copy blocks with pill CTA (rounded-full, hover scale 1.03)
- Fixed glass nav: center pill (bg-white/20 backdrop-blur border-white/30) with
  active item solid, white rounded Sign Up button right
- heroFadeUp keyframes for copy at 0.7s/0.85s; prefers-reduced-motion: none
- cubic-bezier(0.16,1,0.3,1) everywhere
Constraints: data/components stay as-is (Explain, acts, Customer Engine order),
Organik Truck brand + "Powered by Pixel Mint Media" footer unchanged.
Note: app is Next.js (not Vite) — adapt imports accordingly; fonts via next/font.

## Current deployed state (2026-07-29)
Hero = store revenue ₹10.8L (paid+organic sub) + blended ROAS 3.25× (paid sub) + spend;
Dashboard-tab store totals sync daily; Customer Engine under hero; Explain on 15+ stats;
skyline funnel; seasons act; DATA-REQUESTS.md sent to user.
