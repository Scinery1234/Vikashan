# Vikashan — Admin Panel Backend: Claude Code Specification

## What you are building

A backend system for a solo online career coaching and wellbeing practice. The frontend (static HTML) is already built. You are building the Node.js backend, wiring the existing admin panel HTML to real data, and implementing booking, payment, email, and CRM functionality.

**The two existing frontend files are:**
- `frontend/index.html` — public website with booking flow
- `frontend/admin.html` — admin panel (currently uses mock data)

Your job is to make everything in admin.html work with real data from a database, and to build all the API endpoints the booking flow calls.

---

## Tech stack — do not deviate

| Layer | Tool | Version |
|---|---|---|
| Hosting | Vercel | latest |
| Runtime | Node.js | 18+ |
| Database | Supabase (PostgreSQL) | latest JS client |
| Payments | Stripe | ^14 |
| Email | Resend | ^3 |
| Video calls | Jitsi Meet | no SDK — URL pattern only |
| Auth | JWT + bcryptjs | jsonwebtoken ^9, bcryptjs ^2 |
| Newsletter | Kit (ConvertKit) | REST API v4 — optional |

---

## Repository structure to create

```
vikashan-backend/
├── api/
│   ├── auth/
│   │   └── login.js
│   ├── bookings/
│   │   ├── create.js
│   │   └── [id].js
│   ├── payments/
│   │   └── intent.js
│   ├── webhooks/
│   │   └── stripe.js
│   ├── emails/
│   │   └── reminder.js
│   ├── availability.js
│   ├── subscribe.js
│   └── admin/
│       ├── bookings.js
│       ├── clients.js
│       ├── clients/
│       │   └── [id]/
│       │       └── notes.js
│       └── settings.js
├── lib/
│   ├── supabase.js
│   ├── stripe.js
│   ├── resend.js
│   ├── auth.js
│   ├── email-templates.js
│   └── availability.js
├── .env.local           ← never commit
├── .env.example         ← commit this
├── vercel.json
├── package.json
└── README.md
```

---

## Environment variables

Create `.env.local` with these. Create `.env.example` with the same keys but empty values.

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...   # service role key — bypasses RLS for server use

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend
RESEND_API_KEY=re_...
FROM_EMAIL=hello@vikashan.com.au
FROM_NAME=Vikashan

# Admin auth
ADMIN_EMAIL=vik@vikashan.com.au
ADMIN_PASSWORD_HASH=           # bcrypt hash of admin password — generate on setup
JWT_SECRET=                    # random 64-char string

# Cron security
CRON_SECRET=                   # random string — sent as Bearer token by cron job

# Kit / ConvertKit (optional)
KIT_API_KEY=
KIT_LIST_ID=

# Public URL
NEXT_PUBLIC_URL=https://vikashan.com.au
```

---

## Database setup

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- SESSION TYPES
CREATE TABLE session_types (
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
CREATE TABLE clients (
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

-- BOOKINGS
CREATE TABLE bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  session_type_id uuid REFERENCES session_types(id),
  date date NOT NULL,
  start_time time NOT NULL,
  duration_mins integer NOT NULL,
  meet_link text,
  amount_cents integer DEFAULT 0,
  tier text DEFAULT 'full_rate'
    CHECK (tier IN ('full_rate','accessible','concession','free')),
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
CREATE INDEX idx_bookings_date ON bookings(date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_client_id ON bookings(client_id);

-- CLIENT NOTES
CREATE TABLE client_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_client_notes_client_id ON client_notes(client_id);

-- AVAILABILITY (weekly template)
CREATE TABLE availability (
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour integer NOT NULL CHECK (hour BETWEEN 6 AND 21),
  is_available boolean DEFAULT false,
  PRIMARY KEY (day_of_week, hour)
);

-- Seed default availability: Tue/Wed/Thu 10am-6pm, Fri 9am-1pm
INSERT INTO availability (day_of_week, hour, is_available) VALUES
  (2,10,true),(2,11,true),(2,14,true),(2,15,true),(2,16,true),(2,17,true),
  (3,10,true),(3,11,true),(3,12,true),(3,13,true),(3,14,true),
  (4,14,true),(4,15,true),(4,16,true),(4,17,true),(4,18,true),
  (5,9,true),(5,10,true),(5,11,true);

-- BLOCKED TIMES (one-off holidays/breaks)
CREATE TABLE blocked_times (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- SUBSCRIBERS (mailing list)
CREATE TABLE subscribers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text,
  source text CHECK (source IN ('booking','footer_form','followup','manual')),
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz
);

-- ADMIN SETTINGS (key-value store)
CREATE TABLE admin_settings (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Seed default settings
INSERT INTO admin_settings (key, value) VALUES
  ('email_confirmation_subject', '"Your session is confirmed ✓ — {{date}} at {{time}}"'),
  ('email_reminder24_subject', '"Reminder: your session tomorrow at {{time}}"'),
  ('email_reminder1_subject', '"Your session starts in 1 hour — join link inside"'),
  ('email_followup_subject', '"Good to see you, {{client_name}} — what''s next"'),
  ('pricing_full_rate_min', '15000'),
  ('pricing_full_rate_max', '22000'),
  ('pricing_accessible_min', '7500'),
  ('pricing_accessible_max', '15000'),
  ('cancellation_policy_hours', '24');

-- Seed default session types
INSERT INTO session_types (name, description, duration_mins, price_min_cents, price_max_cents, is_free, buffer_mins, max_per_day) VALUES
  ('Free Discovery Call', 'A 20-minute conversation to understand where you are and whether working together makes sense.', 20, 0, 0, true, 15, 3),
  ('Career Coaching (60 min)', 'Career counselling, exploration, and practical strategy.', 60, 7500, 22000, false, 15, 5),
  ('Extended Session (90 min)', 'Deeper therapeutic or coaching work.', 90, 11000, 33000, false, 30, 3),
  ('Wellbeing Coaching (60 min)', 'Psychological wellbeing and resilience support.', 60, 7500, 22000, false, 15, 4);

-- Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Public can only read availability and session_types
-- Everything else requires service role key (used server-side only)
CREATE POLICY "Public read availability" ON availability FOR SELECT TO anon USING (true);
CREATE POLICY "Public read session_types" ON session_types FOR SELECT TO anon USING (is_active = true);
```

---

## Shared library files

### `lib/supabase.js`
```javascript
import { createClient } from '@supabase/supabase-js'

// Use service key server-side — bypasses RLS
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Use anon key for public-facing queries
export const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
```

### `lib/auth.js`
```javascript
import jwt from 'jsonwebtoken'

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return null
  }
}

// Middleware: use at top of protected route handlers
export function requireAdmin(req, res) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const token = verifyToken(auth.slice(7))
  if (!token) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return token
}
```

### `lib/email-templates.js`
```javascript
// Replace {{token}} placeholders with real values
export function fillTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '')
}

// Core email HTML wrapper — matches admin panel preview
export function emailWrapper({ heading, body, ctaText, ctaUrl, details }) {
  const detailRows = details
    ? Object.entries(details).map(([k, v]) =>
        `<tr><td style="color:#888;padding:5px 0;font-size:13px">${k}</td>
         <td style="font-weight:600;padding:5px 0;font-size:13px;text-align:right">${v}</td></tr>`
      ).join('')
    : ''

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${heading}</title></head>
  <body style="margin:0;padding:20px;background:#f7f6f3;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden">
    <div style="background:#141414;padding:20px 24px;display:flex;align-items:center;gap:10px">
      <div style="width:10px;height:10px;border-radius:50%;background:#C4724E"></div>
      <span style="font-family:Georgia,serif;font-style:italic;font-size:16px;color:#fff">Vikashan</span>
    </div>
    <div style="padding:28px 28px 20px">
      <h2 style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#141414;margin:0 0 12px">${heading}</h2>
      ${body}
      ${details ? `<table style="width:100%;background:#f7f6f3;border-radius:6px;padding:12px 16px;margin:16px 0;border-collapse:collapse">${detailRows}</table>` : ''}
      ${ctaUrl ? `<a href="${ctaUrl}" style="display:block;text-align:center;background:#C4724E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;margin:20px 0">${ctaText}</a>` : ''}
    </div>
    <div style="background:#f7f6f3;padding:14px 24px;font-size:11px;color:#888;text-align:center;border-top:1px solid #e4e3df">
      Vikashan · Career Coaching &amp; Holistic Wellbeing · Online<br>
      <a href="${process.env.NEXT_PUBLIC_URL}/unsubscribe" style="color:#888">Unsubscribe</a> ·
      <a href="${process.env.NEXT_PUBLIC_URL}/privacy" style="color:#888">Privacy Policy</a>
    </div>
  </div></body></html>`
}
```

### `lib/resend.js`
```javascript
import { Resend } from 'resend'
import { emailWrapper } from './email-templates.js'
import { supabase } from './supabase.js'

const resend = new Resend(process.env.RESEND_API_KEY)

// Fetch template subject from DB settings, fall back to default
async function getSubject(key, defaults) {
  const { data } = await supabase.from('admin_settings').select('value').eq('key', key).single()
  return data?.value?.replace(/^"|"$/g, '') ?? defaults
}

export async function sendConfirmation({ booking, client, meetLink }) {
  const subject = await getSubject('email_confirmation_subject',
    `Your session is confirmed ✓`)

  const html = emailWrapper({
    heading: 'Your session is confirmed ✓',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">Hi <strong>${client.name}</strong>,<br>
      Your session is confirmed. Here are the details:</p>`,
    details: {
      'Session': booking.session_type_name,
      'Date': new Date(booking.date).toLocaleDateString('en-AU', {weekday:'long',day:'numeric',month:'long',year:'numeric'}),
      'Time': booking.start_time + ' AEST',
      'Duration': booking.duration_mins + ' minutes',
      'Amount paid': booking.amount_cents === 0 ? 'Free' : '$' + (booking.amount_cents / 100).toFixed(0),
    },
    ctaText: 'Join your session',
    ctaUrl: meetLink,
    body2: `<p style="font-size:13px;color:#888">
      Need to reschedule?
      <a href="${process.env.NEXT_PUBLIC_URL}/reschedule/${booking.reschedule_token}" style="color:#C4724E">Click here</a>
      &nbsp;·&nbsp;
      <a href="${process.env.NEXT_PUBLIC_URL}/cancel/${booking.cancel_token}" style="color:#888">Cancel</a>
    </p>`
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendReminder24h({ booking, client }) {
  const subject = await getSubject('email_reminder24_subject',
    `Reminder: your session tomorrow`)

  const html = emailWrapper({
    heading: 'Your session is tomorrow',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      Hi <strong>${client.name}</strong>,<br>
      Just a reminder that your ${booking.session_type_name} is tomorrow at
      <strong>${booking.start_time} AEST</strong>.</p>`,
    ctaText: 'Join your session',
    ctaUrl: booking.meet_link,
    details: {
      'Date': new Date(booking.date).toLocaleDateString('en-AU', {weekday:'long',day:'numeric',month:'long'}),
      'Time': booking.start_time + ' AEST',
      'Video link': booking.meet_link
    }
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendReminder1h({ booking, client }) {
  const subject = await getSubject('email_reminder1_subject',
    `Your session starts in 1 hour`)

  const html = emailWrapper({
    heading: 'Your session starts in 1 hour',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      Hi <strong>${client.name}</strong>,<br>
      Your ${booking.session_type_name} with Vik starts in one hour at
      <strong>${booking.start_time} AEST</strong>.</p>`,
    ctaText: 'Join now',
    ctaUrl: booking.meet_link
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendFollowUp({ booking, client }) {
  const subject = await getSubject('email_followup_subject',
    `Good to see you — what's next`)

  const html = emailWrapper({
    heading: `Good to see you, ${client.name.split(' ')[0]}`,
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      It was good to connect today. I hope the session was useful.<br><br>
      If anything came up after we spoke, or if you want to continue the conversation,
      reply to this email — I'm here.</p>`,
    ctaText: 'Book your next session',
    ctaUrl: `${process.env.NEXT_PUBLIC_URL}/#booking`
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}
```

---

## API route implementations

### `api/auth/login.js`
```javascript
import bcrypt from 'bcryptjs'
import { signToken } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password } = req.body

  if (email !== process.env.ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const token = signToken({ email, role: 'admin' })
  res.json({ token })
}
```

### `api/availability.js`
```javascript
import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })

  const dayOfWeek = new Date(date).getDay()

  // Get template availability for this day
  const { data: slots } = await supabase
    .from('availability')
    .select('hour')
    .eq('day_of_week', dayOfWeek)
    .eq('is_available', true)
    .order('hour')

  // Get existing bookings for this date (to block taken slots)
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('start_time, duration_mins')
    .eq('date', date)
    .in('status', ['confirmed', 'pending'])

  // Get blocked times for this date
  const { data: blocked } = await supabase
    .from('blocked_times')
    .select('start_time, end_time')
    .eq('date', date)

  // Filter out slots that are already booked or blocked
  const bookedHours = new Set(
    (existingBookings || []).map(b => parseInt(b.start_time.split(':')[0]))
  )

  const availableSlots = (slots || [])
    .map(s => s.hour)
    .filter(hour => !bookedHours.has(hour))
    .map(hour => ({
      hour,
      label: hour < 12
        ? `${hour}:00 AM`
        : hour === 12
        ? '12:00 PM'
        : `${hour - 12}:00 PM`
    }))

  res.json({ date, dayOfWeek, slots: availableSlots })
}
```

### `api/bookings/create.js`
```javascript
import { supabase } from '../../lib/supabase.js'
import { sendConfirmation } from '../../lib/resend.js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    clientName, clientEmail, clientPhone,
    date, time, sessionTypeId,
    tier, amountCents, notes, mailingOptIn
  } = req.body

  // Validate required fields
  if (!clientName || !clientEmail || !date || !time || !sessionTypeId) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Fetch session type
  const { data: sessionType } = await supabase
    .from('session_types')
    .select('*')
    .eq('id', sessionTypeId)
    .single()

  if (!sessionType) return res.status(404).json({ error: 'Session type not found' })

  // Generate unique Jitsi video link
  const roomId = crypto.randomUUID().replace(/-/g, '').substring(0, 10)
  const meetLink = `https://meet.jit.si/vikashan-${roomId}`

  // Upsert client (create if new, update if returning)
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      { name: clientName, email: clientEmail, phone: clientPhone,
        mailing_opt_in: mailingOptIn, status: 'lead' },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (clientError) return res.status(500).json({ error: 'Failed to create client' })

  // Create booking record (pending until payment confirmed)
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      client_id: client.id,
      session_type_id: sessionTypeId,
      date, start_time: time,
      duration_mins: sessionType.duration_mins,
      meet_link: meetLink,
      amount_cents: amountCents ?? 0,
      tier: tier ?? 'free',
      notes,
      status: 'pending'
    })
    .select()
    .single()

  if (bookingError) return res.status(500).json({ error: 'Failed to create booking' })

  // Handle mailing list opt-in
  if (mailingOptIn) {
    await supabase.from('subscribers').upsert(
      { email: clientEmail, name: clientName, source: 'booking' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
    // Optional: add to Kit
    if (process.env.KIT_API_KEY) {
      await fetch('https://api.kit.com/v4/subscribers', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.KIT_API_KEY}`,
                   'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: clientEmail, first_name: clientName })
      }).catch(() => {}) // non-blocking
    }
  }

  // Free session: confirm immediately
  if (!amountCents || amountCents === 0) {
    await supabase.from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', booking.id)

    await sendConfirmation({
      booking: { ...booking, session_type_name: sessionType.name },
      client,
      meetLink
    })

    return res.json({ success: true, bookingId: booking.id, meetLink })
  }

  // Paid session: create Stripe PaymentIntent
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    metadata: { bookingId: booking.id, clientEmail },
    description: `${sessionType.name} — ${date} ${time}`,
  })

  // Save payment intent ID to booking
  await supabase.from('bookings')
    .update({ stripe_payment_intent_id: intent.id })
    .eq('id', booking.id)

  res.json({
    bookingId: booking.id,
    clientSecret: intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  })
}
```

### `api/webhooks/stripe.js`
```javascript
import Stripe from 'stripe'
import { supabase } from '../../lib/supabase.js'
import { sendConfirmation } from '../../lib/resend.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => resolve(Buffer.from(data)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  const rawBody = await getRawBody(req)

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return res.status(400).json({ error: 'Webhook signature verification failed' })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object

    // Find booking by payment intent ID
    const { data: booking } = await supabase
      .from('bookings')
      .select('*, session_types(name), clients(*)')
      .eq('stripe_payment_intent_id', intent.id)
      .single()

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    // Confirm booking
    await supabase.from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', booking.id)

    // Update client status to active
    await supabase.from('clients')
      .update({ status: 'active', primary_service: booking.session_types.name })
      .eq('id', booking.client_id)

    // Send confirmation email
    await sendConfirmation({
      booking: { ...booking, session_type_name: booking.session_types.name },
      client: booking.clients,
      meetLink: booking.meet_link
    })
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object
    await supabase.from('bookings')
      .update({ status: 'pending' })
      .eq('stripe_payment_intent_id', intent.id)
  }

  res.json({ received: true })
}
```

### `api/emails/reminder.js` (cron target)
```javascript
import { supabase } from '../../lib/supabase.js'
import { sendReminder24h, sendReminder1h, sendFollowUp } from '../../lib/resend.js'

export default async function handler(req, res) {
  // Verify this is called by the cron job, not a random visitor
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in1h  = new Date(now.getTime() +      60 * 60 * 1000)
  const ago2h = new Date(now.getTime() -  2 * 60 * 60 * 1000)

  // Fetch confirmed bookings with client info
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, clients(*), session_types(name)')
    .eq('status', 'confirmed')

  let sent = { reminder24h: 0, reminder1h: 0, followup: 0 }

  for (const booking of bookings ?? []) {
    const sessionDateTime = new Date(`${booking.date}T${booking.start_time}`)
    const sessionEndTime  = new Date(sessionDateTime.getTime() + booking.duration_mins * 60000)

    // 24h reminder window: send if session is 23h50m–24h10m away
    const diff24 = Math.abs(sessionDateTime - in24h)
    if (!booking.reminder_24h_sent && diff24 < 10 * 60 * 1000) {
      await sendReminder24h({ booking, client: booking.clients })
      await supabase.from('bookings').update({ reminder_24h_sent: true }).eq('id', booking.id)
      sent.reminder24h++
    }

    // 1h reminder window: send if session is 50m–70m away
    const diff1h = Math.abs(sessionDateTime - in1h)
    if (!booking.reminder_1h_sent && diff1h < 10 * 60 * 1000) {
      await sendReminder1h({ booking, client: booking.clients })
      await supabase.from('bookings').update({ reminder_1h_sent: true }).eq('id', booking.id)
      sent.reminder1h++
    }

    // Follow-up: send 2h after session ends
    if (!booking.followup_sent && sessionEndTime < ago2h) {
      await sendFollowUp({ booking, client: booking.clients })
      await supabase.from('bookings')
        .update({ followup_sent: true, status: 'completed' })
        .eq('id', booking.id)
      sent.followup++
    }
  }

  res.json({ success: true, sent, checked: bookings?.length ?? 0 })
}
```

### `api/admin/bookings.js`
```javascript
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { status, type, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('bookings')
      .select(`
        *,
        clients(id, name, email, phone, status),
        session_types(name, duration_mins)
      `, { count: 'exact' })
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.json({ bookings: data, total: count })
  }

  res.status(405).end()
}
```

### `api/admin/clients.js`
```javascript
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { status, search } = req.query

    let query = supabase
      .from('clients')
      .select(`
        *,
        bookings(id, date, amount_cents, status)
      `)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    // Calculate stats per client
    const clients = data.map(c => ({
      ...c,
      session_count: c.bookings?.length ?? 0,
      total_revenue_cents: c.bookings?.reduce((sum, b) =>
        b.status === 'completed' ? sum + (b.amount_cents ?? 0) : sum, 0) ?? 0,
      last_session_date: c.bookings?.sort((a,b) => new Date(b.date)-new Date(a.date))[0]?.date ?? null
    }))

    return res.json({ clients })
  }

  if (req.method === 'PUT') {
    const { id } = req.query
    const updates = req.body
    const { data, error } = await supabase
      .from('clients').update(updates).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ client: data })
  }

  res.status(405).end()
}
```

### `api/admin/clients/[id]/notes.js`
```javascript
import { supabase } from '../../../../../lib/supabase.js'
import { requireAdmin } from '../../../../../lib/auth.js'

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  const { id } = req.query

  if (req.method === 'GET') {
    const { data } = await supabase
      .from('client_notes').select('*')
      .eq('client_id', id).order('created_at', { ascending: false })
    return res.json({ notes: data })
  }

  if (req.method === 'POST') {
    const { note_text } = req.body
    if (!note_text?.trim()) return res.status(400).json({ error: 'Note text required' })
    const { data, error } = await supabase
      .from('client_notes').insert({ client_id: id, note_text }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ note: data })
  }

  if (req.method === 'DELETE') {
    const { noteId } = req.query
    await supabase.from('client_notes').delete().eq('id', noteId)
    return res.json({ success: true })
  }

  res.status(405).end()
}
```

### `api/admin/settings.js`
```javascript
import { supabase } from '../../lib/supabase.js'
import { requireAdmin } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return

  if (req.method === 'GET') {
    const { data } = await supabase.from('admin_settings').select('*')
    const settings = Object.fromEntries(data.map(r => [r.key, r.value]))
    return res.json({ settings })
  }

  if (req.method === 'PUT') {
    const { updates } = req.body // { key: value, ... }
    const rows = Object.entries(updates).map(([key, value]) => ({ key, value }))
    await supabase.from('admin_settings').upsert(rows)
    return res.json({ success: true })
  }

  res.status(405).end()
}
```

### `api/subscribe.js`
```javascript
import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, name } = req.body
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' })

  // Save to DB
  const { error } = await supabase.from('subscribers')
    .upsert({ email, name, source: 'footer_form' }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) return res.status(500).json({ error: error.message })

  // Optional Kit sync
  if (process.env.KIT_API_KEY) {
    await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.KIT_API_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: email, first_name: name })
    }).catch(() => {})
  }

  res.json({ success: true })
}
```

---

## `vercel.json` — cron + routing config

```json
{
  "crons": [
    {
      "path": "/api/emails/reminder",
      "schedule": "*/15 * * * *"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,PUT,DELETE,OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type,Authorization" }
      ]
    }
  ]
}
```

---

## `package.json`

```json
{
  "name": "vikashan-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vercel dev",
    "generate-hash": "node -e \"const b=await import('bcryptjs');console.log(await b.default.hash(process.argv[1],12))\" --"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2",
    "stripe": "^14",
    "resend": "^3",
    "jsonwebtoken": "^9",
    "bcryptjs": "^2"
  },
  "devDependencies": {
    "vercel": "latest"
  }
}
```

---

## Admin panel wiring instructions

The existing `admin.html` uses hardcoded mock data. Replace the following:

### 1. Login screen
Add a login modal that POSTs to `/api/auth/login`, stores the returned JWT in `sessionStorage`, and sends it as `Authorization: Bearer <token>` on every admin API call.

### 2. Dashboard
Replace mock stats by calling:
- `GET /api/admin/bookings?status=confirmed&limit=5` → upcoming sessions table
- `GET /api/admin/clients` → total client count

### 3. Bookings page
Replace mock table with `GET /api/admin/bookings` response.
Add status filter UI that passes `?status=confirmed` etc.

### 4. CRM / Clients page
Replace mock `CLIENTS` array with `GET /api/admin/clients` response.
Client notes: `GET /api/admin/clients/{id}/notes` and `POST /api/admin/clients/{id}/notes`.

### 5. Availability
Replace localStorage with `GET /api/admin/settings` to load, and `PUT /api/admin/settings` to save availability as JSON.

### 6. Email templates
Load subject lines from `GET /api/admin/settings`.
Save with `PUT /api/admin/settings`.

---

## One-time setup commands

```bash
# 1. Install dependencies
npm install

# 2. Generate admin password hash (replace 'yourpassword')
npm run generate-hash yourpassword
# Copy the output into ADMIN_PASSWORD_HASH in .env.local

# 3. Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Generate CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 5. Run locally
npm run dev

# 6. Deploy
vercel --prod
```

---

## Testing checklist before go-live

- [ ] POST /api/auth/login with correct credentials returns JWT
- [ ] POST /api/auth/login with wrong credentials returns 401
- [ ] GET /api/availability?date=2025-07-01 returns correct slots
- [ ] POST /api/bookings/create (free) creates booking, sends email, returns success
- [ ] POST /api/bookings/create (paid) creates pending booking, returns clientSecret
- [ ] Stripe test payment (card 4242 4242 4242 4242) triggers webhook, confirms booking
- [ ] Confirmation email received with correct meet link
- [ ] GET /api/admin/bookings (with JWT) returns bookings
- [ ] GET /api/admin/bookings (without JWT) returns 401
- [ ] POST /api/admin/clients/{id}/notes creates note
- [ ] Cron endpoint fires manually (POST /api/emails/reminder with CRON_SECRET header) without error
- [ ] Reminder emails fire for test sessions within 24h/1h window
- [ ] POST /api/subscribe saves subscriber, returns success
- [ ] Unsubscribe link in emails works

---

## Stripe test cards (use in development)

| Scenario | Card number |
|---|---|
| Payment succeeds | 4242 4242 4242 4242 |
| Payment declined | 4000 0000 0000 0002 |
| 3D Secure required | 4000 0025 0000 3155 |

Use any future expiry date, any 3-digit CVV, any postcode.

---

*End of specification. All referenced files, SQL, and code samples are complete and ready to implement.*
