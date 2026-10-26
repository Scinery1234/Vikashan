import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'
import { requireMember } from '../../lib/newpage-auth.js'
import { QUADRANTS, score } from '../../newpage/quiz-logic.js'
import { buildMe, cleanCheckin, detectCrisis, CRISIS_REPLY, PROGRAM_WEEKS } from '../../lib/newpage-app.js'
import { coachSystem, toApiMessages, runCoach } from '../../lib/newpage-coach.js'

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[0-9a-f-]{36}$/i

async function load(memberId) {
  const [progress, tasks, checkins, memory, messages] = await Promise.all([
    supabase.from('newpage_progress').select('week, step').eq('member_id', memberId),
    supabase.from('newpage_tasks').select('id, title, due, done, source, created_at').eq('member_id', memberId).order('created_at', { ascending: true }).limit(200),
    supabase.from('newpage_checkins').select('clarity, capacity, quadrant, created_at').eq('member_id', memberId).order('created_at', { ascending: true }).limit(60),
    supabase.from('newpage_memory').select('id, note').eq('member_id', memberId).order('created_at', { ascending: true }).limit(60),
    supabase.from('newpage_messages').select('role, content, created_at').eq('member_id', memberId).order('id', { ascending: false }).limit(40)
  ])
  return {
    progress: progress.data || [], tasks: tasks.data || [], checkins: checkins.data || [], memory: memory.data || [],
    messages: (messages.data || []).reverse()
  }
}

async function me(member) {
  const data = await load(member.id)
  return buildMe({ member, ...data, coachOn: !!process.env.ANTHROPIC_API_KEY })
}

// One endpoint for everything a signed-in member does: POST { action, ... }
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  const member = await requireMember(req, res)
  if (!member) return
  const b = req.body || {}

  switch (b.action) {
    case 'me':
      return res.json(await me(member))

    case 'progress': {
      const week = Number(b.week), step = Number(b.step)
      const plan = member.quadrant ? QUADRANTS[member.quadrant].weeks : null
      if (!plan || !Number.isInteger(week) || week < 1 || week > PROGRAM_WEEKS || !Number.isInteger(step) || step < 0 || step >= plan[week - 1].steps.length) {
        return res.status(400).json({ error: 'That step doesn’t exist.' })
      }
      if (b.done) await supabase.from('newpage_progress').upsert({ member_id: member.id, week, step }, { onConflict: 'member_id,week,step' })
      else await supabase.from('newpage_progress').delete().eq('member_id', member.id).eq('week', week).eq('step', step)
      return res.json(await me(member))
    }

    case 'task_add': {
      const title = clip(b.title, 200)
      if (!title) return res.status(400).json({ error: 'Add a short title for the task.' })
      const due = typeof b.due === 'string' && DATE_RE.test(b.due) ? b.due : null
      await supabase.from('newpage_tasks').insert({ member_id: member.id, title, due, source: 'you' })
      return res.json(await me(member))
    }
    case 'task_toggle':
    case 'task_delete': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown task.' })
      const q = supabase.from('newpage_tasks')
      if (b.action === 'task_delete') await q.delete().eq('id', b.id).eq('member_id', member.id)
      else await q.update({ done: !!b.done }).eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member))
    }

    case 'session_booked':
      await supabase.from('newpage_members').update({ session_booked: !!b.booked }).eq('id', member.id)
      return res.json(await me({ ...member, session_booked: !!b.booked }))

    case 'checkin': {
      const answers = cleanCheckin(b.answers)
      if (!answers) return res.status(400).json({ error: 'Please answer all eight statements.' })
      const r = score(answers)
      await supabase.from('newpage_checkins').insert({ member_id: member.id, clarity: r.clarity, capacity: r.capacity, quadrant: r.quadrant, answers })
      // A member who joined without taking the quiz gets their plan from their first check-in.
      let updated = member
      if (!member.quadrant) {
        updated = { ...member, quadrant: r.quadrant, answers }
        await supabase.from('newpage_members').update({ quadrant: r.quadrant, answers }).eq('id', member.id)
      }
      return res.json({ ...(await me(updated)), result: { quadrant: r.quadrant, clarity: r.clarity, capacity: r.capacity, struggling: answers.feel === 5, lowMood: answers.feel === 4 } })
    }

    case 'memory_delete': {
      if (b.all) await supabase.from('newpage_memory').delete().eq('member_id', member.id)
      else if (ID_RE.test(String(b.id))) await supabase.from('newpage_memory').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member))
    }

    case 'coach_clear':
      await supabase.from('newpage_messages').delete().eq('member_id', member.id)
      return res.json(await me(member))

    case 'coach': {
      if (!rateLimit(req, res, { max: 40, windowMs: 60 * 60 * 1000, key: `np-coach-${member.id}` })) return
      const text = clip(b.message, 2000)
      if (!text) return res.status(400).json({ error: 'Type a message first.' })

      // Safety first: this runs on every message, whatever the model would say.
      if (detectCrisis(text)) {
        await supabase.from('newpage_messages').insert([{ member_id: member.id, role: 'user', content: text }, { member_id: member.id, role: 'assistant', content: CRISIS_REPLY }])
        return res.json({ ...(await me(member)), crisis: true })
      }
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The coach isn’t switched on yet. Everything else in New Page works.', code: 'coach_off' })

      const data = await load(member.id)
      const system = coachSystem({ member, tasks: data.tasks, memory: data.memory })
      const tools = {
        run: async (name, input) => {
          if (name === 'save_memory') {
            const note = clip(input.note, 300)
            if (!note) return 'No note given.'
            if (data.memory.length >= 40) return 'Memory is full. Ask the member to clear some notes.'
            await supabase.from('newpage_memory').insert({ member_id: member.id, note })
            return 'Saved.'
          }
          if (name === 'add_task') {
            const title = clip(input.title, 200)
            if (!title) return 'No title given.'
            const due = typeof input.due === 'string' && DATE_RE.test(input.due) ? input.due : null
            await supabase.from('newpage_tasks').insert({ member_id: member.id, title, due, source: 'coach' })
            return 'Added to their task list.'
          }
          return 'Unknown tool.'
        }
      }
      let reply
      try {
        reply = await runCoach({ system, messages: toApiMessages(data.messages, text), tools })
      } catch (err) {
        console.error('Coach failed:', err)
        return res.status(502).json({ error: 'The coach couldn’t answer just now. Please try again in a minute.' })
      }
      await supabase.from('newpage_messages').insert([{ member_id: member.id, role: 'user', content: text }, { member_id: member.id, role: 'assistant', content: reply.text }])
      return res.json({ ...(await me(member)), usedTools: reply.used.map(u => u.name) })
    }

    default:
      return res.status(400).json({ error: 'Unknown action' })
  }
}
