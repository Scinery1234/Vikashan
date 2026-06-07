import { supabase } from '../../lib/supabase.js'
import { createOutlookEvent } from '../../lib/outlook.js'
import { createGoogleCalendarEvent } from '../../lib/google-calendar.js'
import { sendConfirmation, sendPaymentPlanReceipt } from '../../lib/resend.js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const {
    clientName, clientEmail, clientPhone,
    sessionTypeId, date, time,
    amountCentsPerSession, sessionsTotal,
    tier, notes, mailingOptIn,
    paymentMethodId, planAmountCents, planFreq
  } = req.body

  if (!clientName || !clientEmail || !date || !time || !sessionTypeId || !amountCentsPerSession || !sessionsTotal || !paymentMethodId || !planAmountCents) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const totalCents = amountCentsPerSession * sessionsTotal
  const freqMin = { weekly: 5000, fortnightly: 10000, monthly: 20000 }
  const minCents = totalCents < 20000 ? 2500 : (freqMin[planFreq] || 5000)
  if (planAmountCents < minCents) {
    return res.status(400).json({ error: `Minimum payment is $${minCents / 100}.` })
  }

  const firstInstalmentCents = Math.min(planAmountCents, amountCentsPerSession * sessionsTotal)

  const { data: sessionType } = await supabase
    .from('session_types').select('*').eq('id', sessionTypeId).single()
  if (!sessionType) return res.status(404).json({ error: 'Session type not found' })

  const meetLink = process.env.ZOOM_PERSONAL_LINK
  const totalCents = amountCentsPerSession * sessionsTotal
  const instalmentCents = firstInstalmentCents
  const freqDays = { weekly: 7, fortnightly: 14, monthly: 30 }
  const daysUntilNext = freqDays[planFreq] || 30

  // Upsert client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      { name: clientName, email: clientEmail, phone: clientPhone || null, mailing_opt_in: !!mailingOptIn, status: 'lead' },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select().single()
  if (clientError) return res.status(500).json({ error: 'Failed to create client' })

  // Create or retrieve Stripe customer
  const customers = await stripe.customers.list({ email: clientEmail, limit: 1 })
  let customer = customers.data[0]
  if (!customer) {
    customer = await stripe.customers.create({ email: clientEmail, name: clientName })
  }

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id })
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethodId }
  })

  // Charge first instalment immediately
  const intent = await stripe.paymentIntents.create({
    amount: instalmentCents,
    currency: 'aud',
    customer: customer.id,
    payment_method: paymentMethodId,
    confirm: true,
    description: `${sessionType.name} — instalment 1 of 3 — ${clientName}`,
    receipt_email: clientEmail,
    metadata: { clientEmail, instalment: '1', instalmentTotal: '3' }
  })

  if (intent.status !== 'succeeded') {
    return res.status(402).json({ error: 'Payment failed. Please check your card details.' })
  }

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
      status: 'confirmed'
    })
    .select().single()
  if (bookingError) return res.status(500).json({ error: 'Failed to create booking' })

  // Next charge date based on frequency
  const nextCharge = new Date()
  nextCharge.setDate(nextCharge.getDate() + daysUntilNext)
  const nextChargeDate = nextCharge.toISOString().slice(0, 10)
  const remainingAfterFirst = totalCents - instalmentCents
  const instalmentsTotalCount = remainingAfterFirst > 0 ? Math.ceil(remainingAfterFirst / planAmountCents) + 1 : 1

  // Create package
  const { data: pkg } = await supabase
    .from('packages')
    .insert({
      client_id: client.id,
      session_type_id: sessionTypeId,
      sessions_total: sessionsTotal,
      sessions_used: 1,
      amount_cents_per_session: amountCentsPerSession,
      stripe_payment_intent_id: intent.id,
      status: 'active',
      payment_plan: true,
      instalments_total: instalmentsTotalCount,
      instalments_paid: 1,
      instalment_amount_cents: planAmountCents,
      next_charge_date: remainingAfterFirst > 0 ? nextChargeDate : null,
      stripe_customer_id: customer.id,
      stripe_payment_method_id: paymentMethodId
    })
    .select().single()

  await supabase.from('clients').update({ status: 'active' }).eq('id', client.id)

  if (mailingOptIn) {
    await supabase.from('subscribers').upsert(
      { email: clientEmail, name: clientName, source: 'booking' },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  }

  const confirmedBooking = { ...booking, session_type_name: sessionType.name }
  await Promise.all([
    sendConfirmation({ booking: confirmedBooking, client, zoomLink: meetLink, sessionsTotal, paymentPlan: true, instalmentCents, totalCents }),
    createOutlookEvent({ booking: confirmedBooking, client, meetLink }),
    createGoogleCalendarEvent({ booking: confirmedBooking, client, meetLink })
  ])

  res.json({ success: true, bookingId: booking.id, packageId: pkg.id })
}
