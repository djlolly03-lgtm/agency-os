-- Lock down the PostgREST surface.
--
-- Nothing in this app reads through the Supabase JS client (src/lib/supabase/*
-- is parked, see src/middleware.ts). All data goes through src/lib/db.ts, a
-- node-postgres pool connecting as the `postgres` role, which owns these tables
-- and therefore bypasses RLS. So enabling RLS with no policies closes the
-- anon-key REST API completely while leaving the app untouched.
--
-- Applied live to project qncrpxgvrshjjnvhugna on 16 Sep 2026 after Supabase
-- flagged every public table as "RLS Disabled in Public" (CRITICAL).
-- Recorded here so a rebuilt database is not silently wide open again.

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- unified_daily sums spend/impressions/clicks/purchases/revenue across
-- fact_ad_daily, ads, ad_sets, campaigns and ad_accounts. A plain `create view`
-- runs with the owner's privileges, so it would serve all of that straight past
-- the RLS enabled above. security_invoker makes it run as the caller instead.
alter view public.unified_daily set (security_invoker = on);
