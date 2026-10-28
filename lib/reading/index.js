// Wires the Career Reading service to the real things: Supabase, Claude,
// Resend and Stripe. `base` is this deployment's own address, used to start
// the next batch of writing (see service.js).
import Stripe from 'stripe'
import { Resend } from 'resend'
import { supabase } from '../supabase.js'
import { supabaseStore } from './store.js'
import { createReadingService } from './service.js'
import { claudeRunner } from './pipeline.js'
import { getQuantumSeed } from './seed.js'

export const siteUrl = () => process.env.READING_URL || 'https://reading.vikashan.org'

// Starts a batch in its own function run. Waits only long enough for the
// request to go out; the cron sweep picks up anything that doesn't start.
export function kicker(base) {
  return async id => {
    try {
      await fetch(`${base}/api/reading?op=work&id=${id}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(2500)
      })
    } catch { /* expected: we don't wait for the batch to finish */ }
  }
}

export const baseOf = req => `https://${req.headers['x-forwarded-host'] || req.headers.host}`

export function readingService(base) {
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  return createReadingService({
    store: supabaseStore(supabase),
    runner: claudeRunner({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.READING_MODEL || 'claude-opus-5-5',
      quickModel: process.env.READING_QUICK_MODEL || 'claude-haiku-5-5',
      effort: process.env.READING_EFFORT || 'low'
    }),
    mail: resend && (m => resend.emails.send({ from: `${process.env.FROM_NAME || 'Vikashan'} <${process.env.FROM_EMAIL}>`, reply_to: process.env.ADMIN_EMAIL, ...m })),
    stripe: process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null,
    getSeed: getQuantumSeed,
    siteUrl: siteUrl(),
    kick: kicker(base)
  })
}
