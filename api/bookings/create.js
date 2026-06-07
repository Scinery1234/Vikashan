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
    date, time, sessionTypeId,
    tier, amountCents, notes, mailingOptIn
  } = req.body

  if (!clientName || !clientEmail || !date || !time || !sessionTypeId) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const { data: sessionType } = await supabase
    .from('session_types')
    .select('*')
    .eq('id', sessionTypeId)
    .single()

  if (!sessionType) return res.status(404).json({ error: 'Session type not found' })

  // Use the configured Zoom personal room link for all sessions
  const zoomLink = process.env.ZOOM_PERSONAL_LINK

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      {
        name: clientName,
        email: clientEmail,
        phone: clientPhone || null,
        mailing_opt_in: !!mailingOptIn,
        status: 'lead'
      },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (clientError) return res.status(500).json({ error: 'Failed to create client' })

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      client_id: client.id,
      session_type_id: sessionTypeId,
      date,
      start_time: time,
      duration_mins: sessionType.duration_mins,
      meet_link: zoomLink,
      amount_cents: amountCents ?? 0,
      tier: tier ?? 'free',
      notes: notes || null,
      status: 'pending'
    })
    .select()
    .single()

  if (bookingError) return res.status(500).json({ error: 'Failed to create booking' })

  if (mailingOptIn) {
    await supabase.from('subscribers').upsert(
      { email: clientEmail, name: clientName, source: 'booking' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
    if (process.env.KIT_API_KEY) {
      fetch('https://api.kit.com/v4/subscribers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KIT_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email_address: clientEmail, first_name: clientName })
      }).catch(() => {})
    }
  }

  // Free / discovery call — confirm immediately
  if (!amountCents || amountCents === 0) {
    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id)
    const confirmedBooking = { ...booking, session_type_name: sessionType.name }
    await Promise.all([
      sendConfirmation({ booking: confirmedBooking, client, zoomLink }),
      createOutlookEvent({ booking: confirmedBooking, client, meetLink: zoomLink }),
      createGoogleCalendarEvent({ booking: confirmedBooking, client, meetLink: zoomLink })
    ])
    return res.json({ success: true, bookingId: booking.id, zoomLink })
  }

  // Paid session — create Stripe PaymentIntent
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    metadata: { bookingId: booking.id, clientEmail },
    description: `${sessionType.name} — ${date} ${time}`,
  })

  await supabase.from('bookings')
    .update({ stripe_payment_intent_id: intent.id })
    .eq('id', booking.id)

  res.json({
    bookingId: booking.id,
    clientSecret: intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  })
}
