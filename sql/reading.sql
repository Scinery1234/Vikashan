-- Career Reading (reading.vikashan.org): one row per reading, from the cast to the finished report.
-- Run once in the Supabase SQL editor, after schema.sql and newpage.sql. Safe to run again.
--
-- status: cast → awaiting_payment → queued → running → done | failed
-- The id is a random UUID and works as the reading's private link.
-- The reading is written in batches by api/reading.js; lease_until stops two
-- batches writing the same reading at once.
create table if not exists career_readings (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'cast' check (status in ('cast', 'awaiting_payment', 'queued', 'running', 'done', 'failed')),
  seed integer not null,
  cast_at timestamptz not null,
  asked_at timestamptz,
  email text check (email is null or char_length(email) <= 254),
  input jsonb,                 -- {person, answers, question}: needed to write and re-render the report
  outputs jsonb,               -- each step's output, saved as the reading is written
  progress jsonb,              -- {done, total}
  report text,                 -- the finished Markdown
  error text,
  paid boolean not null default false,
  preview boolean not null default false,
  stripe_session text,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists career_readings_status on career_readings (status);
create index if not exists career_readings_created on career_readings (created_at);
alter table career_readings enable row level security;   -- server only (service key)
