-- Narrative sections of the monthly review — the parts no data source can
-- produce: what went wrong this month, what we're doing next month, and what
-- we need from the client. Previously these lived only in the hand-built
-- slide deck; storing them here lets /[client]/review render a complete
-- month-end document and keeps last month's text around as a starting point.
--
-- One row per (client, month, section). `section` is an open string rather
-- than an enum so new sections can be added without a migration.

create table review_notes (
  client_id uuid not null references clients(id) on delete cascade,
  month date not null,                -- YYYY-MM-01
  section text not null,              -- 'challenges' | 'next_month' | 'support_needed' | ...
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (client_id, month, section)
);

create index review_notes_client_month_idx on review_notes (client_id, month);
