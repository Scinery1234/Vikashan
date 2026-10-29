import { supabase } from '../../lib/supabase.js'
import { sendMail, fromAddress } from '../../lib/newpage-mail.js'
import { memoryEmail } from '../../lib/newpage-emails.js'
import { signMemory } from '../../lib/newpage-auth.js'
import { retentionStep, trashOn, RETENTION } from '../../lib/newpage-retention.js'
import { eraseMemory, restoreMemoryAccess } from '../../lib/newpage-memory-store.js'

const BASE = () => process.env.NEXT_PUBLIC_URL || 'https://vikashan.org'

// Daily cron (vercel.json). Looks after Sky's memory once a membership ends:
// reminders at day 7 and 14, the Trash at day 30, and permanent deletion 12 months later.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })

  const { data: members, error } = await supabase.from('newpage_members')
    .select('id, email, name, status, access_until, access_ended_at, memory_state, memory_trashed_at, memory_reminder').neq('memory_state', 'purged')
  if (error) return res.status(500).json({ error: error.message })

  const out = { restored: 0, marked: 0, reminded: 0, trashed: 0, purged: 0, failed: 0 }
  const now = Date.now()
  for (const m of members || []) {
    if (m.memory_state === 'purged') continue
    try {
      let { step, day, ended } = retentionStep(m, now)
      if (step === 'mark') {
        const stamp = new Date(ended).toISOString()
        await supabase.from('newpage_members').update({ access_ended_at: stamp }).eq('id', m.id)
        m.access_ended_at = stamp
        out.marked++
        ;({ step, day, ended } = retentionStep(m, now)) // a membership that ended long ago goes straight to its stage
      }
      if (step === 'restore') { await restoreMemoryAccess(m); out.restored++ }
      else if (step === 'purge') { await eraseMemory(m.id, { state: 'purged' }); out.purged++ }
      else if (step === 'remind' || step === 'trash' || step === 'notice') {
        if (step === 'trash') {
          await supabase.from('newpage_members').update({ memory_state: 'trash', memory_trashed_at: new Date(now).toISOString() }).eq('id', m.id)
          out.trashed++
        }
        const link = `${BASE()}/newpage/memory?t=${encodeURIComponent(signMemory(m.id, step === 'remind' ? '45d' : '400d'))}`
        const mail = memoryEmail({ name: m.name, day, trashDate: trashOn(ended), link, rejoinUrl: `${BASE()}/newpage/join` })
        await sendMail({ from: fromAddress(), to: m.email, reply_to: process.env.ADMIN_EMAIL, subject: mail.subject, html: mail.html })
        await supabase.from('newpage_members').update({ memory_reminder: day }).eq('id', m.id)
        if (step === 'remind') out.reminded++
      }
    } catch (err) {
      console.error('Memory retention failed for', m.id, err.message)
      out.failed++
    }
  }
  res.json({ ok: true, ...out, rules: RETENTION })
}
