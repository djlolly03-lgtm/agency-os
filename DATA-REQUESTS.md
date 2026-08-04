# Organik Truck — Data Gaps & Requests

What's missing from the current data sheet, what each item unlocks on the dashboard,
and how much effort it takes. Priority order.

---

## P1 — High value, minutes of effort

### 1. Monthly customer counts (new vs returning) — ✅ RECEIVED (3 Aug)
- **Status:** all 9 months loaded (Nov '25 – Jul '26), from the "Organik Truck data"
  sheet's tab 1. Customer Engine is now fully lit.

### 2. Offline sales — monthly number
- **Have:** nothing yet — confirmed still pending on the client's side.
- **Unlocks:** the Online vs Offline split at the top of the overview.
- **How:** one ₹ figure per month from the client, entered on the Internal page.

### 3. Real monthly targets — ✅ RECEIVED (3 Aug)
- **Status:** revenue/spend/orders targets loaded for Jan–Jul from tab 3
  ("Expected Numbers"). Pacing and goal-attainment now compare against real
  targets instead of the "+25%" default. August target not yet set.

### 4. Creatives Drive folder share — ✅ RECEIVED (30 Jul)
- **Status:** folder indexed — climbing daily as the team's naming alignment lands
  (149 → 150+ ads auto-matched and rising). Unmatched ads can be linked by hand
  on the Internal page's matching queue.

---

## P2 — High value, one-time exports

### 5. Shopify customer-level order export — ✅ RECEIVED (3 Aug)
- **Status:** 7,098 order-level rows ingested (tab 5, "Shopify Extract"), Nov '25–Jul
  '26. New-customer AOV and repeat-customer AOV are now real and unlocked on the
  Customer Engine, plus a measured (revenue-to-date) LTV alongside the derived model.
  ~12% of orders had no email on file and count as one-off anonymous customers —
  worth asking Shopify/checkout settings whether email can be made required.

### 6. Google Ads history before May 2026 — mostly ✅ RECEIVED (3 Aug)
- **Status:** tab 6 ("Google data") supplied daily rows from 15 Dec 2025 onward;
  ingested for the Dec 15 – Apr 30 gap (153 campaign-days). Dec 1–14 2025 still
  has no daily Google rows if that week's export exists — worth double-checking.

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

### 10. November 2025 store total
- **Missing:** still no genuine Shopify store total for Nov '25 (the "Achieved"
  column in tab 3 mirrors our own computed Meta numbers, not a store total).
- **Unlocks:** completes the monthly report and organic history back to day one.

---

## P4 — Validation

### 11. Season windows sign-off
- Ongoing, not a one-time fix — needs input from sales + farmers as the actual
  season windows shift year to year (mango moved from ~April to mid-month this
  year vs last). Worth a recurring 10-min check-in each quarter against
  `src/lib/seasons.ts`, not a single sign-off.

### 12. Division mapping spot-check — 🚩 real issue found, PENDING on the team (3 Aug)
- Cross-checked our auto-classified Fruits & Veggies vs Groceries split against
  the client-reported numbers in tab 7 for Apr–Jun — they don't match (our
  Groceries revenue reads roughly a third of what's reported).
- **"Apro Campaign" is correctly classified** — Sandeep confirmed it's Apricot,
  a fruit. Not the issue.
- **Checked all 51 campaigns by name** (not just the top spenders) — every other
  campaign classifies correctly too, except one immaterial one ("Tomato Ketchup",
  ~₹4.5k revenue — a grocery item currently bucketed as F&V, too small to matter).
- **Real driver:** *"Performance Max-1 Only feed"* and *"...TG"* did **₹5.7L
  combined revenue in Apr–Jun**, currently counted 100% as Fruits & Veggies.
  These are Google Performance Max campaigns running the *entire product feed*
  in one campaign — structurally mixed, can't be split by campaign name at all.
- **Question sent to the team (3 Aug):** can Google Ads pull a product-level or
  asset-group-level breakdown for these two campaigns, so Fruits & Veggies vs
  Groceries revenue can be split correctly? If Google doesn't expose that for
  Performance Max, this becomes a permanent limitation rather than an open bug.
- **Status: pending team's answer.** No classifier changes made.

---

*Resolved (no action needed): store totals + organic sync daily from the
Dashboard tab; pre-May Google monthlies folded into all paid totals; funnel
labels audited; creative thumbnails self-heal (Drive link expiry fixed);
cross-region latency fixed (functions moved to Tokyo, next to the database).*
