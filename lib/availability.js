import { supabase } from './supabase.js'

// Open one-hour slots on a date (YYYY-MM-DD), after weekly hours, one-off
// extra hours, existing bookings and blocked times. Shared by the public
// booking page and the New Page member booking.
export async function getAvailableSlots(date) {
  const [y, m, d] = date.split('-').map(Number)
  const dayOfWeek = new Date(y, m - 1, d).getDay()

  const [{ data: slots }, { data: existingBookings }, { data: blocked }, { data: overrides }] = await Promise.all([
    supabase
      .from('availability')
      .select('hour')
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .order('hour'),
    supabase
      .from('bookings')
      .select('start_time, duration_mins')
      .eq('date', date)
      .in('status', ['confirmed', 'pending']),
    supabase
      .from('blocked_times')
      .select('start_time, end_time')
      .eq('date', date),
    supabase
      .from('available_overrides')
      .select('hour')
      .eq('date', date)
  ])

  const bookedHours = new Set()
  for (const b of existingBookings || []) {
    const startHour = parseInt(b.start_time.split(':')[0])
    const numHours = Math.ceil((b.duration_mins || 60) / 60)
    for (let h = startHour; h < startHour + numHours; h++) bookedHours.add(h)
  }

  const blockedHours = new Set()
  for (const b of blocked || []) {
    if (!b.start_time) continue
    const start = parseInt(b.start_time.split(':')[0])
    const end = parseInt(b.end_time.split(':')[0])
    for (let h = start; h < end; h++) blockedHours.add(h)
  }

  const fullDayBlock = (blocked || []).some(b => !b.start_time)

  // Combine weekly template hours + one-off override hours
  const overrideHours = new Set((overrides || []).map(o => o.hour))
  const templateHours = new Set((slots || []).map(s => s.hour))
  const allHours = [...new Set([...templateHours, ...overrideHours])].sort((a, b) => a - b)

  const availableSlots = fullDayBlock ? [] : allHours
    .filter(hour => !bookedHours.has(hour) && !blockedHours.has(hour))
    .map(hour => ({
      hour,
      label: hour < 12
        ? `${hour}:00 am`
        : hour === 12
        ? '12:00 pm'
        : `${hour - 12}:00 pm`
    }))

  return { dayOfWeek, slots: availableSlots }
}
