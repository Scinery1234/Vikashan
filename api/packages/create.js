import { supabase } from '../../lib/supabase.js'
import { sendConfirmation } from '../../lib/resend.js'
import { createOutlookEvent } from '../../lib/outlook.js'
import { createGoogleCalendarEvent } from '../../lib/google-calendar.js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const {
    clientName, clientEmail, clientPhone,
    sessionTypeId, date, time,
    amountCentsPerSession, sessionsTotal,
    tier, notes, mailingOptIn, recurDates
  } = req.body

  if (!clientName || !clientEmail || !date || !time || !sessionTypeId || !amountCentsPerSession || !sessionsTotal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const { data: sessionType } = await supabase
    .from('session_types')
    .select('*')
    .eq('id', sessionTypeId)
    .single()

  if (!sessionType) return res.status(404).json({ error: 'Session type not found' })

  const meetLink = process.env.ZOOM_PERSONAL_LINK
  const totalCents = amountCentsPerSession * sessionsTotal

  // Upsert client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      { name: clientName, email: clientEmail, phone: clientPhone || null, mailing_opt_in: !!mailingOptIn, status: 'lead' },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (clientError) return res.status(500).json({ error: 'Failed to create client' })

  // Create first booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      client_id: client.id,
      session_type_id: sessionTypeId,
      date, start_time: time,
      duration_mins: sessionType.duration_mins,
      meet_link: meetLink,
      amount_cents: amountCentsPerSession,
      tier: tier || 'full_rate',
      notes: notes || null,
      status: 'pending'
    })
    .select()
    .single()

  if (bookingError) return res.status(500).json({ error: 'Failed to create booking' })

  // Create package record
  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .insert({
      client_id: client.id,
      session_type_id: sessionTypeId,
      sessions_total: sessionsTotal,
      sessions_used: 0,
      amount_cents_per_session: amountCentsPerSession,
      status: 'pending'
    })
    .select()
    .single()

  if (pkgError) return res.status(500).json({ error: 'Failed to create package' })

  if (mailingOptIn) {
    await supabase.from('subscribers').upsert(
      { email: clientEmail, name: clientName, source: 'booking' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  }

  // Create Stripe PaymentIntent for full package amount
  const intent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: 'aud',
    metadata: { bookingId: booking.id, packageId: pkg.id, clientEmail, sessionsTotal },
    description: `${sessionType.name} × ${sessionsTotal} — ${clientName}`,
    receipt_email: clientEmail
  })

  await supabase.from('bookings').update({ stripe_payment_intent_id: intent.id }).eq('id', booking.id)
  await supabase.from('packages').update({ stripe_payment_intent_id: intent.id }).eq('id', pkg.id)

  // Create placeholder bookings for recurring dates (confirmed after payment)
  if (recurDates && recurDates.length > 1) {
    const extraDates = recurDates.slice(1) // first date already created above
    await supabase.from('bookings').insert(extraDates.map(d => ({
      client_id: client.id,
      session_type_id: sessionTypeId,
      date: d,
      start_time: time,
      duration_mins: sessionType.duration_mins,
      meet_link: meetLink,
      amount_cents: amountCentsPerSession,
      tier: tier || 'full_rate',
      notes: notes || null,
      status: 'pending',
      package_id: pkg.id,
      stripe_payment_intent_id: intent.id
    })))
  }

  res.json({
    bookingId: booking.id,
    packageId: pkg.id,
    clientSecret: intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    totalCents
  })
}
