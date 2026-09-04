-- Client-provided exports, dropped as CSVs (not from the auto-synced Sheets),
-- ingested via scripts/seed_offline_data.ts. Same one-time-import-then-static
-- pattern as manual_actuals: re-running the script with a fresh CSV replaces
-- a client_id's rows wholesale (delete + reinsert), so these stay current
-- only as often as the client re-exports and someone re-runs the script.

-- Pincode Wise Orders Over Time — genuinely monthly, full Nov'25-Aug'26
-- history. Keyed on the SHIPPING postal code (falls back to billing when
-- shipping is blank) — that's the meaningful "where did this actually go"
-- signal, not the billing address.
create table pincode_orders (
  client_id uuid not null references clients(id) on delete cascade,
  month date not null,
  postal_code text not null,
  orders integer not null,
  qty_per_order numeric,
  aov numeric,
  primary key (client_id, month, postal_code)
);
create index pincode_orders_client_month_idx on pincode_orders (client_id, month);

-- New vs Returning Customers by Product — an ALL-TIME snapshot as of
-- `as_of` (no month column in the client's export), not a time series.
-- Re-running the seed script with a fresher export replaces the snapshot;
-- it does not accumulate history on its own.
create table product_customer_mix (
  client_id uuid not null references clients(id) on delete cascade,
  product_title text not null,
  segment text not null check (segment in ('new', 'returning')),
  customers integer not null,
  orders integer not null,
  aov numeric,
  qty_ordered numeric,
  as_of date not null,
  primary key (client_id, product_title, segment)
);

-- Product Wise Sales — same all-time-snapshot caveat as above. Carries
-- `sales_reversals` (refunds/returns), which is what extends the refund
-- analysis already built from shopify_orders down to product granularity.
create table product_sales (
  client_id uuid not null references clients(id) on delete cascade,
  product_title text not null,
  vendor text,
  product_type text,
  segment text not null check (segment in ('new', 'returning')),
  net_items_sold integer,
  gross_sales numeric,
  discounts numeric,
  sales_reversals numeric,
  net_sales numeric,
  taxes numeric,
  total_sales numeric,
  as_of date not null,
  primary key (client_id, product_title, segment)
);
