-- Monthly goals (Triple Whale-style forecasting/pacing).
-- One row per client x month x metric; targets set by the agency.

create table goals (
  client_id uuid not null references clients(id) on delete cascade,
  month date not null,                     -- first of month
  metric text not null check (metric in ('spend','revenue','orders','roas')),
  target numeric not null,
  updated_at timestamptz not null default now(),
  primary key (client_id, month, metric)
);
