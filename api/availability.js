import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })

  // getDay() on a date string parsed as UTC can be off by one — parse safely
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

  const bookedHours = new Set(
    (existingBookings || []).map(b => parseInt(b.start_time.split(':')[0]))
  )

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

  res.json({ date, dayOfWeek, slots: availableSlots })
}
