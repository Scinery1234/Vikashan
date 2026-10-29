import { supabase } from '../../lib/supabase.js'
import { sendConfirmation } from '../../lib/resend.js'
import { createOutlookEvent } from '../../lib/outlook.js'
import { createGoogleCalendarEvent } from '../../lib/google-calendar.js'
import { rateLimit, isBot, sanitiseObject } from '../../lib/security.js'
import { slotProblem } from '../../lib/booking-price.js'
import { ensureClient } from '../../lib/booking-client.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  if (!rateLimit(req, res, { max: 10, windowMs: 60 * 60 * 1000, key: 'booking-create' })) return
  if (isBot(req.body)) return res.status(400).json({ error: 'Invalid request' })

  const body = sanitiseObject(req.body)
  const {
    clientName, clientEmail, clientPhone,
    date, time, sessionTypeId,
    notes, mailingOptIn
  } = body

  if (!clientName || !clientEmail || !date || !time || !sessionTypeId) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const { data: sessionType } = await supabase
    .from('session_types')
    .select('*')
    .eq('id', sessionTypeId)
    .single()

  if (!sessionType) return res.status(404).json({ error: 'Session type not found' })
  if (sessionType.members_only) return res.status(403).json({ error: 'That session is for New Page members. Sign in at /newpage/app to book it.' })
  // This endpoint books free calls only. Paid sessions go through /api/packages/create,
  // which works out the price itself. A price sent from the browser is never used.
  if (!sessionType.is_free) return res.status(400).json({ error: 'That session needs to be paid for. Please use the booking page.' })
  const problem = await slotProblem(date, time)
  if (problem) return res.status(409).json({ error: problem })

  // Use the configured Zoom personal room link for all sessions
  const zoomLink = process.env.ZOOM_PERSONAL_LINK

  const { client, error: clientError } = await ensureClient({ name: clientName, email: clientEmail, phone: clientPhone, mailingOptIn })
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
      amount_cents: 0,
      tier: 'free',
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
  await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id)
  const confirmedBooking = { ...booking, session_type_name: sessionType.name }
  await Promise.all([
    sendConfirmation({ booking: confirmedBooking, client, zoomLink }),
    createOutlookEvent({ booking: confirmedBooking, client, meetLink: zoomLink }),
    createGoogleCalendarEvent({ booking: confirmedBooking, client, meetLink: zoomLink })
  ])
  return res.json({ success: true, bookingId: booking.id, zoomLink })
}
