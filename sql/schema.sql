-- Vikashan site database: every table the site's code uses.
-- Run once in the Supabase SQL editor, then run sql/newpage.sql.
-- Safe to run again: it only creates what's missing.
--
-- Based on CLAUDE_CODE_SPEC.md ("Database setup"), plus three tables the
-- code uses that the spec doesn't define (packages, available_overrides,
-- site_content) and two values the code sends that the spec's checks would
-- reject (booking tier 'returning', subscriber source 'quiz').

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- SESSION TYPES
CREATE TABLE IF NOT EXISTS session_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  duration_mins integer NOT NULL DEFAULT 60,
  price_min_cents integer DEFAULT 0,
  price_max_cents integer DEFAULT 0,
  is_free boolean DEFAULT false,
  buffer_mins integer DEFAULT 15,
  max_per_day integer DEFAULT 5,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- CLIENTS (CRM)
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  status text DEFAULT 'lead'
    CHECK (status IN ('active','inactive','lead','concession')),
  primary_service text,
  tags text[] DEFAULT '{}',
  intake_signed boolean DEFAULT false,
  mailing_opt_in boolean DEFAULT false,
  concession_rate_cents integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- PACKAGES (multi-session bookings and payment plans)
CREATE TABLE IF NOT EXISTS packages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  session_type_id uuid REFERENCES session_types(id),
  sessions_total integer NOT NULL DEFAULT 1,
  sessions_used integer NOT NULL DEFAULT 0,
  amount_cents_per_session integer NOT NULL DEFAULT 0,
  stripe_payment_intent_id text,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','cancelled')),
  payment_plan boolean DEFAULT false,
  instalments_total integer,
  instalments_paid integer DEFAULT 0,
  instalment_amount_cents integer,
  next_charge_date date,
  stripe_customer_id text,
  stripe_payment_method_id text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_packages_client_id ON packages(client_id);
CREATE INDEX IF NOT EXISTS idx_packages_next_charge ON packages(next_charge_date) WHERE payment_plan = true;

-- BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  session_type_id uuid REFERENCES session_types(id),
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  duration_mins integer NOT NULL,
  meet_link text,
  amount_cents integer DEFAULT 0,
  tier text DEFAULT 'full_rate'
    CHECK (tier IN ('full_rate','accessible','concession','free','returning')),
  stripe_payment_intent_id text,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  reminder_24h_sent boolean DEFAULT false,
  reminder_1h_sent boolean DEFAULT false,
  followup_sent boolean DEFAULT false,
  notes text,
  cancel_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  reschedule_token text DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON bookings(client_id);

-- CLIENT NOTES
CREATE TABLE IF NOT EXISTS client_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);

-- AVAILABILITY (weekly template)
CREATE TABLE IF NOT EXISTS availability (
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour integer NOT NULL CHECK (hour BETWEEN 6 AND 21),
  is_available boolean DEFAULT false,
  PRIMARY KEY (day_of_week, hour)
);

-- Default availability: Tue/Wed/Thu 10am-6pm, Fri 9am-1pm
INSERT INTO availability (day_of_week, hour, is_available) VALUES
  (2,10,true),(2,11,true),(2,14,true),(2,15,true),(2,16,true),(2,17,true),
  (3,10,true),(3,11,true),(3,12,true),(3,13,true),(3,14,true),
  (4,14,true),(4,15,true),(4,16,true),(4,17,true),(4,18,true),
  (5,9,true),(5,10,true),(5,11,true)
ON CONFLICT (day_of_week, hour) DO NOTHING;

-- AVAILABLE OVERRIDES (extra one-off hours on a given date)
CREATE TABLE IF NOT EXISTS available_overrides (
  date date NOT NULL,
  hour integer NOT NULL CHECK (hour BETWEEN 0 AND 23),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, hour)
);

-- BLOCKED TIMES (one-off holidays/breaks)
CREATE TABLE IF NOT EXISTS blocked_times (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- SUBSCRIBERS (mailing list)
CREATE TABLE IF NOT EXISTS subscribers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text,
  source text CHECK (source IN ('booking','footer_form','followup','manual','quiz')),
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz
);

-- ADMIN SETTINGS (key-value store)
CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO admin_settings (key, value) VALUES
  ('email_confirmation_subject', '"Your session is confirmed ✓ — {{date}} at {{time}}"'),
  ('email_reminder24_subject', '"Reminder: your session tomorrow at {{time}}"'),
  ('email_reminder1_subject', '"Your session starts in 1 hour — join link inside"'),
  ('email_followup_subject', '"Good to see you, {{client_name}} — what''s next"'),
  ('pricing_full_rate_min', '15000'),
  ('pricing_full_rate_max', '22000'),
  ('pricing_accessible_min', '7500'),
  ('pricing_accessible_max', '15000'),
  ('cancellation_policy_hours', '24')
ON CONFLICT (key) DO NOTHING;

-- SITE CONTENT (text edited from the site's admin bar)
CREATE TABLE IF NOT EXISTS site_content (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Default session types (only if there are none yet)
INSERT INTO session_types (name, description, duration_mins, price_min_cents, price_max_cents, is_free, buffer_mins, max_per_day)
SELECT * FROM (VALUES
  ('Free Discovery Call', 'A 20-minute conversation to understand where you are and whether working together makes sense.', 20, 0, 0, true, 15, 3),
  ('Career Coaching (60 min)', 'Career counselling, exploration, and practical strategy.', 60, 7500, 22000, false, 15, 5),
  ('Extended Session (90 min)', 'Deeper therapeutic or coaching work.', 90, 11000, 33000, false, 30, 3),
  ('Wellbeing Coaching (60 min)', 'Psychological wellbeing and resilience support.', 60, 7500, 22000, false, 15, 4)
) AS v(name, description, duration_mins, price_min_cents, price_max_cents, is_free, buffer_mins, max_per_day)
WHERE NOT EXISTS (SELECT 1 FROM session_types);

-- Row Level Security: only the server (service key) reads or writes, except
-- the public reads below.
ALTER TABLE session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE available_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read availability" ON availability;
CREATE POLICY "Public read availability" ON availability FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Public read session_types" ON session_types;
CREATE POLICY "Public read session_types" ON session_types FOR SELECT TO anon USING (is_active = true);
