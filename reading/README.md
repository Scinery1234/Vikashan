# Career Reading

A long, personal careers reading at **reading.vikashan.org** (also at `vikashan.org/reading`), in the New Page look. The person answers 22–23 questions (a Work Style Compass short form and the New Page quadrant questions), gives their birth details, casts an I Ching and Tarot draw that is sealed before they type their question, then asks it. The reading is written in the background in about five minutes: the draw, the draw applied to the question, five birth charts (Natal, Vedic, Human Design, Gene Keys, Numerology) each read on its own for career, a profile, where they are now, the next 30 days, the answer, and their New Page 4-week plan with a personal layer. The design and the rules (why no step sees another step's writing) are in `PLAN.md`.

## Where things are

| Path | What |
|---|---|
| `reading/index.html`, `reading.js`, `reading.css` | The pages: questions, birth details, cast, question, progress, the reading. Plain JS, no build. |
| `reading/shared/quiz.js`, `safety.js` | Quiz questions and scoring, crisis words. Used by the page and the server. |
| `reading/sample.md` | A sample reading (Jordan Park, fictional) shown at `/sample`. |
| `api/reading.js` | The API, one function chosen by `?op=` (see the comment at the top). |
| `api/webhooks/stripe.js` | Also handles Career Reading payments (`metadata.kind = career_reading`). |
| `lib/reading/` | The engine: chart calculation (`astro.js`, `astro/`), the draw (`oracle.js`), the step pipeline, the report renderer, the service and the store. |
| `sql/reading.sql` | The `career_readings` table. |
| `tests/reading-*.test.js` | Engine, service and API tests (`npm test`). |

## How it runs on Vercel

Vercel functions stop after each request, so the reading is written in batches. Each batch is one run of `api/reading.js?op=work`: it takes a lease on the reading, writes steps for up to `READING_WORK_SECONDS` (240 by default; the function's `maxDuration` is 300 in `vercel.json`), saves them, and if steps are left, starts the next batch. A cron every minute (`/api/reading`) restarts any reading that's queued or whose batch stopped. Internal calls use `CRON_SECRET`.

## Setup

1. **Database:** run `sql/reading.sql` in the Supabase SQL editor.
2. **Subdomain:** in Vercel, open this project → Settings → Domains, add `reading.vikashan.org`, and add the DNS record Vercel shows (usually a CNAME to `cname.vercel-dns.com`). `vercel.json` already routes that host to the reading pages.
3. **Settings** (Vercel → Settings → Environment Variables): `ANTHROPIC_API_KEY` (required), and the existing Supabase, Stripe, Resend and `CRON_SECRET` settings. To test without payments first, set `READING_FREE=1`. Optional: `READING_PRICE_CENTS` (default 4900) and `READING_CURRENCY` (default `aud`).
4. **Stripe webhook:** in Stripe → Developers → Webhooks, open the endpoint for `https://vikashan.org/api/webhooks/stripe` and add the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. No products need creating: the price is set in the checkout.
5. **Plan limits:** the per-minute cron and a 300-second function need Vercel Pro. On a lower limit, lower `maxDuration` in `vercel.json` and set `READING_WORK_SECONDS` about 60 below it.

Test card in Stripe test mode: `4242 4242 4242 4242`, any future date, any CVC.

## Privacy

Readings are kept for 90 days (`READING_KEEP_DAYS`), then deleted when the next reading is cast. The reading opens from a private link. The AI that writes each section sees only that section's data, never the full name at birth. Add a line about Career Readings to `privacy.html` before launch.
