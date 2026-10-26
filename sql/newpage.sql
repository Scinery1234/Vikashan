-- New Page quiz (Phase 1). Run once in the Supabase SQL editor.

-- Quiz sign-ups can now join the mailing list. Skipped if the site's main
-- tables (sql/schema.sql) haven't been created yet;
-- run this file again after creating them.
DO $$
BEGIN
  IF to_regclass('public.subscribers') IS NOT NULL THEN
    ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS subscribers_source_check;
    ALTER TABLE subscribers ADD CONSTRAINT subscribers_source_check
      CHECK (source IN ('booking','footer_form','followup','manual','quiz'));
  END IF;
END $$;

-- One row per "Send my plan". A retake marks earlier rows for the same email
-- as superseded, so only the latest result gets follow-up emails.
CREATE TABLE IF NOT EXISTS newpage_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  name text,
  answers jsonb NOT NULL,
  personal jsonb DEFAULT '{}',
  quadrant text NOT NULL CHECK (quadrant IN ('recharge','explore','unstick','launch')),
  clarity integer NOT NULL,
  capacity integer NOT NULL,
  burnout boolean DEFAULT false,
  low_mood boolean DEFAULT false,
  struggling boolean DEFAULT false,
  intro_call_offered boolean DEFAULT false,
  intent text DEFAULT 'plan' CHECK (intent IN ('plan','waitlist')),
  wants_program boolean DEFAULT false,
  opt_in boolean DEFAULT false,
  stay_subscribed boolean DEFAULT false,
  source jsonb DEFAULT '{}',
  session_id text,
  unsubscribe_token text UNIQUE NOT NULL,
  plan_sent_at timestamptz,
  last_followup_day integer DEFAULT 0,
  superseded boolean DEFAULT false,
  unsubscribed_at timestamptz,
  converted_at timestamptz,          -- set when they buy New Page or book a call
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newpage_leads_email_idx ON newpage_leads (email);
CREATE INDEX IF NOT EXISTS newpage_leads_followup_idx ON newpage_leads (created_at)
  WHERE superseded = false AND opt_in = true AND unsubscribed_at IS NULL AND converted_at IS NULL;

-- Anonymous funnel events: views, starts, each answer, results, clicks.
CREATE TABLE IF NOT EXISTS newpage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text,
  event text NOT NULL,
  question text,
  idx integer,
  quadrant text,
  place text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ref text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newpage_events_created_idx ON newpage_events (created_at);

-- Scholarship applications. Vik sets status to 'approved' or 'declined' and
-- decided_at; the form closes after 5 approvals in a calendar month.
CREATE TABLE IF NOT EXISTS newpage_scholarships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  about text NOT NULL,
  situation text NOT NULL,
  quadrant text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Only the server (service key) touches these tables.
ALTER TABLE newpage_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_scholarships ENABLE ROW LEVEL SECURITY;

-- Funnel by step for the last 30 days (sessions reaching each step).
CREATE OR REPLACE VIEW newpage_funnel_30d AS
SELECT event, count(DISTINCT session_id) AS sessions
FROM newpage_events
WHERE created_at > now() - interval '30 days'
GROUP BY event;

-- Drop-off by question for the last 30 days.
CREATE OR REPLACE VIEW newpage_dropoff_30d AS
SELECT idx AS question_number, question, count(DISTINCT session_id) AS sessions_answered
FROM newpage_events
WHERE event = 'answer' AND created_at > now() - interval '30 days'
GROUP BY idx, question
ORDER BY idx;

-- "Tell me when it opens" from the program page (people who haven't taken
-- the quiz), and when each person was sent the launch email.
CREATE TABLE IF NOT EXISTS newpage_waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text,
  source jsonb DEFAULT '{}',
  unsubscribe_token text UNIQUE NOT NULL,
  launch_notified_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE newpage_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_leads ADD COLUMN IF NOT EXISTS launch_notified_at timestamptz;

-- ── New Page member app (/newpage/app) ───────────────────────────
-- Members sign in with an emailed link. Access is granted from
-- newpage/admin (or, later, by the New Page checkout).
CREATE TABLE IF NOT EXISTS newpage_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  source text DEFAULT 'manual' CHECK (source IN ('purchase','scholarship','manual')),
  quadrant text CHECK (quadrant IN ('recharge','explore','unstick','launch')),
  answers jsonb,
  personal jsonb DEFAULT '{}',
  lead_id uuid,
  plan_started_at timestamptz DEFAULT now(),
  session_booked boolean DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS newpage_progress (
  member_id uuid REFERENCES newpage_members(id) ON DELETE CASCADE,
  week integer NOT NULL,
  step integer NOT NULL,
  done_at timestamptz DEFAULT now(),
  PRIMARY KEY (member_id, week, step)
);

CREATE TABLE IF NOT EXISTS newpage_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES newpage_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  due date,
  done boolean DEFAULT false,
  source text DEFAULT 'you' CHECK (source IN ('you','coach')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newpage_tasks_member_idx ON newpage_tasks (member_id);

CREATE TABLE IF NOT EXISTS newpage_checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES newpage_members(id) ON DELETE CASCADE,
  clarity integer NOT NULL,
  capacity integer NOT NULL,
  quadrant text NOT NULL,
  answers jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newpage_checkins_member_idx ON newpage_checkins (member_id, created_at);

CREATE TABLE IF NOT EXISTS newpage_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id uuid REFERENCES newpage_members(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newpage_messages_member_idx ON newpage_messages (member_id, id);

CREATE TABLE IF NOT EXISTS newpage_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES newpage_members(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newpage_memory_member_idx ON newpage_memory (member_id);

ALTER TABLE newpage_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE newpage_memory ENABLE ROW LEVEL SECURITY;
