import { getAvailableSlots } from '../lib/availability.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })

  const { dayOfWeek, slots } = await getAvailableSlots(date)
  res.json({ date, dayOfWeek, slots })
}
