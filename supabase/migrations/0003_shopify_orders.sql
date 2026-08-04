-- Order-level Shopify export (client-provided, one-time + refreshable).
-- Unlocks real new-vs-repeat AOV and measured LTV, replacing the derived
-- geometric model. Ingested via src/lib/shopify.ts (full delete+reinsert
-- per client — idempotent, no need for a natural per-row key since refund
-- lines can repeat an order_id).

create table shopify_orders (
  id bigserial primary key,
  client_id uuid not null references clients(id) on delete cascade,
  order_id bigint not null,
  order_name text,
  day date not null,
  customer_key text not null,        -- lower(trim(email)) or 'anon:'||order_id when email is blank
  customer_name text,
  total numeric not null
);

create index shopify_orders_client_day_idx on shopify_orders (client_id, day);
create index shopify_orders_client_customer_idx on shopify_orders (client_id, customer_key);
