import { supabase } from '../../lib/supabase.js'
import { sendConfirmation } from '../../lib/resend.js'
import { createOutlookEvent } from '../../lib/outlook.js'
import { createGoogleCalendarEvent } from '../../lib/google-calendar.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const {
    clientName, clientEmail, sessionTypeId, sessionName,
    durationMins, date, time, notes, packageId
  } = req.body

  if (!clientName || !clientEmail || !sessionTypeId || !date || !time) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const { data: sessionType } = await supabase
    .from('session_types')
    .select('*')
    .eq('id', sessionTypeId)
    .single()

  if (!sessionType) return res.status(404).json({ error: 'Session type not found' })

  const meetLink = process.env.ZOOM_PERSONAL_LINK

  // Upsert client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .upsert(
      { name: clientName, email: clientEmail, status: 'active' },
      { onConflict: 'email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (clientError) return res.status(500).json({ error: 'Failed to create client' })

  // Create booking — no payment, confirmed immediately
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      client_id: client.id,
      session_type_id: sessionTypeId,
      date,
      start_time: time,
      duration_mins: sessionType.duration_mins,
      meet_link: meetLink,
      amount_cents: 0,
      tier: 'returning',
      notes: notes || null,
      status: 'confirmed',
      package_id: packageId || null
    })
    .select()
    .single()

  if (bookingError) return res.status(500).json({ error: 'Failed to create booking' })

  // If linked to a package, update sessions used
  if (packageId) {
    const { data: pkg } = await supabase
      .from('packages')
      .select('sessions_used, sessions_total')
      .eq('id', packageId)
      .single()
    if (pkg) {
      await supabase
        .from('packages')
        .update({ sessions_used: (pkg.sessions_used || 0) + 1 })
        .eq('id', packageId)
    }
  }

  const confirmedBooking = { ...booking, session_type_name: sessionType.name }

  await Promise.all([
    sendConfirmation({ booking: confirmedBooking, client, zoomLink: meetLink }),
    createOutlookEvent({ booking: confirmedBooking, client, meetLink }),
    createGoogleCalendarEvent({ booking: confirmedBooking, client, meetLink })
  ])

  return res.json({ success: true, bookingId: booking.id })
}
