# Organik Truck — Data Gaps & Requests

What's missing from the current data sheet, what each item unlocks on the dashboard,
and how much effort it takes. Priority order.

---

## P1 — High value, minutes of effort

### 1. Monthly customer counts (new vs returning) — ✅ RECEIVED (3 Aug)
- **Status:** all 9 months loaded (Nov '25 – Jul '26), from the "Organik Truck data"
  sheet's tab 1. Customer Engine is now fully lit.

### 2. Offline sales — monthly number — ✅ RECEIVED (4 Aug)
- **Status:** all 9 months loaded (Nov '25–Jul '26) from the "2. Offline orders" tab in
  the customer-data sheet. Online vs Offline split is fully live everywhere.
- **Bonus:** this tab's "Online Numbers" column also gave us the Nov '25 store
  revenue, which had been missing since day one — see item #10, mostly resolved.

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

### 10. November 2025 store total — mostly ✅ RESOLVED (4 Aug)
- **Status:** Nov '25 store revenue (₹2.72L) landed as a side-effect of the
  Offline-orders tab update (its "Online Numbers" column matches our totals
  for every other month to the rupee, so we trust the Nov figure too).
- **Still missing:** Nov '25 store *order count* specifically — nobody's sent
  that number, so the Customer Engine coverage strip still shows Nov as
  incomplete (LTV:CAC needs orders for AOV). One number away from fully closed.

---

## P4 — Validation

### 11. Season windows sign-off
- Ongoing, not a one-time fix — needs input from sales + farmers as the actual
  season windows shift year to year (mango moved from ~April to mid-month this
  year vs last). Worth a recurring 10-min check-in each quarter against
  `src/lib/seasons.ts`, not a single sign-off.

### 12. Division mapping spot-check — 🔄 re-diagnosed, theory changed (updated 6 Aug)
- Team's "pre-April" backfill landed early (well ahead of Friday) — tab 7 now
  has all 9 months, Nov '25–Jul '26, and they've split it finer: **Fruits /
  Vegetables / Groceries** as three categories instead of two.
- Cross-checked all 9 months against our computed split. **New read: this
  probably isn't a misclassification bug.** Both Fruits+Veggies AND Groceries
  read lower on our side than the client's sheet, every single month — if
  campaigns were just landing in the wrong bucket, one side would read high
  and the other low. Both reading low points to a SCOPE difference instead:
  their sheet likely tracks total category sales (paid + organic), ours sums
  only paid ad-platform revenue — the same paid-vs-organic gap already shown
  at the top of the dashboard, just broken out by division too.
- **Concrete anomaly found:** Feb '26 reads **₹0 Groceries** on our side vs
  their ₹10.3k spend / ₹32k sales. Checked every active Feb campaign by name
  — all genuinely produce (Grapes, Strawberry, Ponkh, Mushrooms, etc.), none
  grocery-flavored. Either their Feb Groceries figure is organic-only (no ad
  spend behind it that month), or worth a quick check on their end.
- Prior finding (still true, just no longer believed to be the PRIMARY driver):
  *"Performance Max-1 Only feed"* + *"...TG"* run Google's full product feed
  in one campaign, 100% counted as Fruits & Veggies — structurally mixed,
  can't split by name. Question about product-level Google reporting still
  open, still not urgent.
- **No classifier code changed** — holding until the organic-vs-paid theory
  is confirmed one way or the other.
- **Status: pending team's answer.** No classifier changes made.

---

*Resolved (no action needed): store totals + organic sync daily from the
Dashboard tab; pre-May Google monthlies folded into all paid totals; funnel
labels audited; creative thumbnails self-heal (Drive link expiry fixed);
cross-region latency fixed (functions moved to Tokyo, next to the database).*
