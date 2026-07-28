-- Agency OS — core schema (v1)
-- Runs identically on Supabase (cloud) and PGlite (local dev).
-- Design ref: ../../../ARCHITECTURE.md §4

-- gen_random_uuid() is core Postgres (13+); no extensions needed.

-- ============ Entities ============

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create table ad_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in ('meta','google')),
  external_account_id text,                -- unknown during Sheets era
  unique (client_id, platform, external_account_id)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  name text not null,
  external_id text,                        -- backfilled if/when API ingestion arrives
  objective text,
  first_seen date,
  last_seen date,
  unique (ad_account_id, name)             -- Sheets-era identity = name within account
);

create table ad_sets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  external_id text,
  unique (campaign_id, name)
);

create table ads (
  id uuid primary key default gen_random_uuid(),
  ad_set_id uuid not null references ad_sets(id) on delete cascade,
  name text not null,
  external_id text,
  format text,                             -- video|static|carousel|ugc|post|unknown (parsed/tagged)
  launched_on date,                        -- min("Starts") seen in exports
  unique (ad_set_id, name)
);

-- ============ Creative assets (Drive) ============

create table creative_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  drive_file_id text unique,
  filename text not null,
  mime_type text,
  thumbnail_url text,                      -- cached copy in storage, not a live Drive link
  tags jsonb not null default '{}'::jsonb, -- {format, hook, language, offer, founder, ...}
  indexed_at timestamptz not null default now()
);

create table creative_links (
  ad_id uuid not null references ads(id) on delete cascade,
  asset_id uuid not null references creative_assets(id) on delete cascade,
  match_type text not null check (match_type in ('exact','fuzzy','manual')),
  confidence numeric,
  created_at timestamptz not null default now(),
  primary key (ad_id, asset_id)
);

-- ============ Facts ============
-- Meta: honest grain is day x ad. Google (Sheets era): day x campaign.
-- Only additive columns are stored; every ratio metric is computed at read time.

create table fact_ad_daily (
  ad_id uuid not null references ads(id) on delete cascade,
  day date not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint,
  frequency numeric,                       -- non-additive; kept for daily display only
  link_clicks bigint not null default 0,
  lp_views bigint not null default 0,
  adds_to_cart bigint not null default 0,
  payment_info bigint not null default 0,
  checkouts bigint not null default 0,
  purchases numeric not null default 0,
  revenue numeric not null default 0,
  delivery text,
  primary key (ad_id, day)                 -- idempotent upserts: re-pasting a day is harmless
);
create index fact_ad_daily_day_idx on fact_ad_daily (day);

create table fact_campaign_daily (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  day date not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric not null default 0,  -- Google reports fractional conversions
  conv_value numeric not null default 0,
  primary key (campaign_id, day)
);
create index fact_campaign_daily_day_idx on fact_campaign_daily (day);

-- ============ Declared manual inputs ============
-- Legitimizes what today lives as typed Dashboard cells (Shopify totals,
-- pre-May-2026 Google monthlies, customer splits).

create table manual_actuals (
  client_id uuid not null references clients(id) on delete cascade,
  month date not null,                     -- first of month
  metric text not null,                    -- total_orders|total_revenue|google_spend|...
  value numeric not null,
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (client_id, month, metric)
);

-- ============ Intelligence ============

create table ad_status_snapshots (
  ad_id uuid not null references ads(id) on delete cascade,
  day date not null,
  status text not null check (status in ('winner','hidden_gem','average','fatiguing','testing','losing')),
  reasons jsonb not null default '[]'::jsonb,
  primary key (ad_id, day)
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  severity text not null check (severity in ('info','warn','critical','win')),
  kind text not null,                      -- cpa_spike|creative_winner|spend_no_revenue|platform_flip|data_quality|...
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index alerts_open_idx on alerts (client_id, created_at desc) where resolved_at is null;

-- ============ Ingestion audit ============

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source text not null,                    -- sheet_meta|sheet_google|drive|seed
  ran_at timestamptz not null default now(),
  rows_upserted int not null default 0,
  anomalies jsonb not null default '[]'::jsonb
);

-- ============ Semantic layer ============
-- Single source of truth for metric formulas: API, UI tooltips and the future
-- AI assistant all read from here. Mirrors the 7 formulas the workbook
-- duplicated ~800 times.

create table metric_definitions (
  key text primary key,
  label text not null,
  formula text not null,                   -- human-readable definition
  format text not null,                    -- currency|number|percent|ratio
  description text
);

insert into metric_definitions (key, label, formula, format, description) values
 ('spend',      'Spend',        'sum(spend)',                          'currency', 'Total media spend'),
 ('revenue',    'Revenue',      'sum(revenue)',                        'currency', 'Purchase conversion value attributed by the platform'),
 ('purchases',  'Purchases',    'sum(purchases)',                      'number',   'Attributed purchases'),
 ('roas',       'ROAS',         'revenue / spend',                     'ratio',    'Return on ad spend'),
 ('cpa',        'CPA',          'spend / purchases',                   'currency', 'Cost per purchase (a.k.a. Cost Per Sale)'),
 ('aov',        'AOV',          'revenue / purchases',                 'currency', 'Average order value'),
 ('cpm',        'CPM',          'spend / impressions * 1000',          'currency', 'Cost per 1,000 impressions'),
 ('cpc',        'CPC',          'spend / link_clicks',                 'currency', 'Cost per link click'),
 ('ctr',        'CTR',          'link_clicks / impressions',           'percent',  'Link click-through rate'),
 ('cplpv',      'CPLPV',        'spend / lp_views',                    'currency', 'Cost per landing page view'),
 ('cvr',        'CVR',          'purchases / lp_views',                'percent',  'Landing page view to purchase rate');

-- ============ Read model ============
-- Unified daily platform rollup (campaign grain), the workhorse for
-- overview KPIs, trends and platform comparison.

create view unified_daily as
select ca.ad_account_id,
       aa.client_id,
       'meta'::text as platform,
       f.day,
       ca.id as campaign_id,
       sum(f.spend) as spend,
       sum(f.impressions) as impressions,
       sum(f.link_clicks) as clicks,
       sum(f.lp_views) as lp_views,
       sum(f.adds_to_cart) as adds_to_cart,
       sum(f.purchases) as purchases,
       sum(f.revenue) as revenue
from fact_ad_daily f
join ads a on a.id = f.ad_id
join ad_sets s on s.id = a.ad_set_id
join campaigns ca on ca.id = s.campaign_id
join ad_accounts aa on aa.id = ca.ad_account_id
group by 1,2,3,4,5
union all
select ca.ad_account_id,
       aa.client_id,
       'google'::text as platform,
       f.day,
       ca.id as campaign_id,
       sum(f.spend), sum(f.impressions), sum(f.clicks),
       0, 0,
       sum(f.conversions), sum(f.conv_value)
from fact_campaign_daily f
join campaigns ca on ca.id = f.campaign_id
join ad_accounts aa on aa.id = ca.ad_account_id
group by 1,2,3,4,5;
