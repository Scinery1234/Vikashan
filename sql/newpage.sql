-- New Page quiz (Phase 1). Run once in the Supabase SQL editor.

-- Quiz sign-ups can now join the mailing list.
ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS subscribers_source_check;
ALTER TABLE subscribers ADD CONSTRAINT subscribers_source_check
  CHECK (source IN ('booking','footer_form','followup','manual','quiz'));

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
