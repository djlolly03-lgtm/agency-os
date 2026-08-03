# Organik Truck — Data Gaps & Requests

What's missing from the current data sheet, what each item unlocks on the dashboard,
and how much effort it takes. Priority order.

---

## P1 — High value, minutes of effort

### 1. Monthly customer counts (new vs returning) — Feb 2026 → today
- **Have:** Dec 2025 and Jan 2026 only.
- **Missing:** Feb, Mar, Apr, May, Jun, Jul.
- **Unlocks:** the Customer Engine for all 9 months — LTV:CAC trend, repeat-rate trend,
  new-customer growth curve. Right now 7 of 9 months are dark.
- **How:** Shopify Analytics → Customers → "First-time vs returning" per month.
  Two numbers per month, entered on the dashboard's Internal page (each empty month
  chip on the Customer Engine links straight to the right form).

### 2. Offline sales — monthly number
- **Have:** nothing ("awaiting client number" on the dashboard).
- **Unlocks:** the Online vs Offline split at the top of the overview.
- **How:** one ₹ figure per month from the client, entered on the Internal page.

### 3. Real monthly targets
- **Have:** none — the dashboard assumes "last month +25%" everywhere (marked with *).
- **Unlocks:** honest pacing, projections, and goal-attainment insights.
- **How:** Internal page → Goals; 3 numbers a month (revenue / spend / orders).

### 4. Creatives Drive folder share — ✅ RECEIVED (30 Jul)
- **Status:** folder indexed — 408 files, 145 of 360 ads auto-matched (111 exact + 34 fuzzy).
  Thumbnails are live on the dashboard; the daily sync re-indexes and re-matches
  automatically, so the match rate climbs as the team's naming alignment lands.
- **Remaining:** unmatched ads can be linked by hand on the Internal page's matching queue.

---

## P2 — High value, one-time exports

### 5. Shopify customer-level order export (one-time, then monthly)
- **Have:** only monthly aggregates.
- **Unlocks:** **new-customer AOV vs repeat-customer AOV** (currently shown as locked),
  measured LTV (replacing the derived model), cohort retention, purchase-frequency
  distribution. This is the single biggest unlock left.
- **How:** Shopify → Orders export with customer email/ID column (CSV). We add a tab
  or upload; the pipeline does the rest.

### 6. Google Ads history before May 2026 (daily, campaign-level)
- **Have:** Dec–Apr Google exists only as one monthly number per month.
- **Missing:** daily rows for Dec 2025 – Apr 2026.
- **Unlocks:** accurate daily trends/heatmap for those months, campaign drill-downs,
  proper same-days deltas.
- **How:** Google Ads → Reports → daily campaign report for the period → paste into
  "Raw Data - Google" (same format as today).

---

## P3 — Improves quality going forward (change the export template once)

### 7. Ad ID column in the Meta export
- **Why:** ads are matched by name today; duplicate names (e.g. "All Fruits Veg Sales
  Ad 12 Feb – Non Organic" exists under multiple ad sets) and renames can split or
  merge creative stats. Ad ID makes identity exact.

### 8. Meta engagement columns
- **Missing:** comments, shares, saves, quality/engagement/conversion rankings.
- **Unlocks:** engagement metrics on creative cards; better fatigue detection.
- **How:** add columns to the daily Meta export template.

### 9. Google ad/asset-level rows
- **Why:** Google is campaign-level only, so Google creatives can't appear in the
  creative gallery or funnel.
- **How:** switch the Google daily report to ad/asset granularity (same paste flow).

### 10. November 2025 store totals
- **Missing:** the Nov Dashboard block has Meta only — no store total, orders, or organic.
- **Unlocks:** completes the monthly report and organic history back to day one.

---

## P4 — Validation (no new data, just review)

### 11. Season windows sign-off
- The dashboard's produce season calendar (mango Mar–Jul, litchi May–Jul, ponkh
  Dec–Feb, etc.) uses our India-market estimates. 10 minutes with the procurement
  team against `src/lib/seasons.ts` sharpens every seasonal insight.

### 12. Division mapping spot-check
- Campaigns are auto-classified Fruits & Veggies vs Groceries by name. Worth a
  once-over (e.g. old "Performance Max-1" campaigns default to F&V).

---

*Resolved this week (no action needed): store totals + organic now sync daily from the
Dashboard tab; pre-May Google monthlies folded into all paid totals; funnel labels audited.*
