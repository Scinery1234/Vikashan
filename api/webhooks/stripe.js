import Stripe from 'stripe'
import { supabase } from '../../lib/supabase.js'
import { sendConfirmation } from '../../lib/resend.js'
import { createOutlookEvent } from '../../lib/outlook.js'
import { createGoogleCalendarEvent } from '../../lib/google-calendar.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
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

    const { data: booking } = await supabase
      .from('bookings')
      .select('*, session_types(name), clients(*)')
      .eq('stripe_payment_intent_id', intent.id)
      .single()

    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    await supabase.from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', booking.id)

    await supabase.from('clients')
      .update({ status: 'active', primary_service: booking.session_types.name })
      .eq('id', booking.client_id)

    // Activate package if this payment is for one
    if (intent.metadata?.packageId) {
      await supabase.from('packages')
        .update({ status: 'active', sessions_used: 1 })
        .eq('id', intent.metadata.packageId)
    }

    const confirmedBooking = { ...booking, session_type_name: booking.session_types.name }
    const sessionsTotal = intent.metadata?.sessionsTotal ? parseInt(intent.metadata.sessionsTotal) : 1
    await Promise.all([
      sendConfirmation({ booking: confirmedBooking, client: booking.clients, zoomLink: booking.meet_link, sessionsTotal }),
      createOutlookEvent({ booking: confirmedBooking, client: booking.clients, meetLink: booking.meet_link }),
      createGoogleCalendarEvent({ booking: confirmedBooking, client: booking.clients, meetLink: booking.meet_link })
    ])
  }

  if (event.type === 'payment_intent.payment_failed') {
    await supabase.from('bookings')
      .update({ status: 'pending' })
      .eq('stripe_payment_intent_id', event.data.object.id)
  }

  res.json({ received: true })
}
