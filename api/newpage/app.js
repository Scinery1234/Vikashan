import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'
import { requireMember } from '../../lib/newpage-auth.js'
import { QUADRANTS, score } from '../../newpage/quiz-logic.js'
import { buildMe, cleanCheckin, detectCrisis, CRISIS_REPLY, PROGRAM_WEEKS } from '../../lib/newpage-app.js'
import { coachSystem, toApiMessages, runCoach, askJson } from '../../lib/newpage-coach.js'
import { isCoach } from '../../lib/newpage-coaches.js'
import {
  COMPASS_SYSTEM, COMPASS_TASKS, cleanCompass,
  DOC_SYSTEM, RESUME_SCHEMA, COVER_SCHEMA, resumePrompt, coverPrompt, cleanResume, cleanCover, docTitle, clipText
} from '../../lib/newpage-tools.js'

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[0-9a-f-]{36}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const coachOf = v => (typeof v === 'string' && isCoach(v) ? v : 'career')
const cleanDate = v => (typeof v === 'string' && DATE_RE.test(v) ? v : null)
const cleanTime = v => (typeof v === 'string' && TIME_RE.test(v) ? v : null)
const cleanMins = v => (Number.isInteger(Number(v)) && Number(v) >= 5 && Number(v) <= 600 ? Number(v) : null)

async function load(memberId, coach = 'career') {
  const [progress, tasks, checkins, memory, messages, goals] = await Promise.all([
    supabase.from('newpage_progress').select('week, step').eq('member_id', memberId),
    supabase.from('newpage_tasks').select('id, title, due, done, source, created_at, block_start, block_mins, goal_id').eq('member_id', memberId).order('created_at', { ascending: true }).limit(200),
    supabase.from('newpage_checkins').select('clarity, capacity, quadrant, created_at').eq('member_id', memberId).order('created_at', { ascending: true }).limit(60),
    supabase.from('newpage_memory').select('id, note').eq('member_id', memberId).order('created_at', { ascending: true }).limit(60),
    supabase.from('newpage_messages').select('role, content, created_at').eq('member_id', memberId).eq('coach', coach).order('id', { ascending: false }).limit(40),
    supabase.from('newpage_goals').select('id, title, target, done').eq('member_id', memberId).order('created_at', { ascending: true }).limit(50)
  ])
  return {
    progress: progress.data || [], goals: goals.data || [],
    tasks: (tasks.data || []).map(t => ({ id: t.id, title: t.title, due: t.due, done: t.done, source: t.source, goalId: t.goal_id || null, start: t.block_start ? String(t.block_start).slice(0, 5) : null, mins: t.block_mins || null })), checkins: checkins.data || [], memory: memory.data || [],
    messages: (messages.data || []).reverse()
  }
}

async function me(member, coach = 'career') {
  const data = await load(member.id, coach)
  return { ...buildMe({ member, ...data, coachOn: !!process.env.ANTHROPIC_API_KEY }), coach }
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
      return res.json(await me(member, coachOf(b.coach)))

    case 'progress': {
      const week = Number(b.week), step = Number(b.step)
      const plan = member.quadrant ? QUADRANTS[member.quadrant].weeks : null
      if (!plan || !Number.isInteger(week) || week < 1 || week > PROGRAM_WEEKS || !Number.isInteger(step) || step < 0 || step >= plan[week - 1].steps.length) {
        return res.status(400).json({ error: 'That step doesn’t exist.' })
      }
      if (b.done) await supabase.from('newpage_progress').upsert({ member_id: member.id, week, step }, { onConflict: 'member_id,week,step' })
      else await supabase.from('newpage_progress').delete().eq('member_id', member.id).eq('week', week).eq('step', step)
      return res.json(await me(member, coachOf(b.coach)))
    }

    case 'task_add': {
      const title = clip(b.title, 200)
      if (!title) return res.status(400).json({ error: 'Add a short title for the task.' })
      const row = { member_id: member.id, title, due: cleanDate(b.due), source: 'you' }
      const start = cleanTime(b.start)
      if (start && row.due) { row.block_start = start; row.block_mins = cleanMins(b.mins) || 30 }
      if (ID_RE.test(String(b.goalId))) row.goal_id = b.goalId
      await supabase.from('newpage_tasks').insert(row)
      return res.json(await me(member, coachOf(b.coach)))
    }
    case 'task_add_many': {
      const titles = (Array.isArray(b.titles) ? b.titles : []).map(t => clip(t, 200)).filter(Boolean).slice(0, 10)
      if (titles.length) await supabase.from('newpage_tasks').insert(titles.map(title => ({ member_id: member.id, title, due: cleanDate(b.due), source: 'compass' })))
      return res.json(await me(member, coachOf(b.coach)))
    }
    case 'task_update': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown task.' })
      const patch = {}
      if (b.title !== undefined) { const t = clip(b.title, 200); if (t) patch.title = t }
      if (b.due !== undefined) patch.due = cleanDate(b.due)
      if (b.start !== undefined) { patch.block_start = cleanTime(b.start); patch.block_mins = patch.block_start ? (cleanMins(b.mins) || 30) : null }
      if (Object.keys(patch).length) await supabase.from('newpage_tasks').update(patch).eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member, coachOf(b.coach)))
    }
    case 'goal_add': {
      const title = clip(b.title, 200)
      if (!title) return res.status(400).json({ error: 'Name your goal in a few words.' })
      await supabase.from('newpage_goals').insert({ member_id: member.id, title, target: cleanDate(b.target) })
      return res.json(await me(member, coachOf(b.coach)))
    }
    case 'goal_toggle':
    case 'goal_delete': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown goal.' })
      const q = supabase.from('newpage_goals')
      if (b.action === 'goal_delete') {
        await supabase.from('newpage_tasks').update({ goal_id: null }).eq('goal_id', b.id).eq('member_id', member.id)
        await q.delete().eq('id', b.id).eq('member_id', member.id)
      } else await q.update({ done: !!b.done }).eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member, coachOf(b.coach)))
    }
    case 'reminders_set':
      await supabase.from('newpage_members').update({ reminders: !!b.on }).eq('id', member.id)
      return res.json(await me({ ...member, reminders: !!b.on }, coachOf(b.coach)))

    // ── Saved tool state (Compass answers, resume background) ──
    case 'tool_get': {
      if (!['compass', 'profile'].includes(b.tool)) return res.status(400).json({ error: 'Unknown tool.' })
      const { data } = await supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', b.tool).maybeSingle()
      return res.json({ data: b.tool === 'compass' ? cleanCompass(data?.data) : { text: clipText(data?.data?.text, 12000) } })
    }
    case 'tool_save': {
      if (!['compass', 'profile'].includes(b.tool)) return res.status(400).json({ error: 'Unknown tool.' })
      const data = b.tool === 'compass' ? cleanCompass(b.data) : { text: clipText(b.data?.text, 12000) }
      await supabase.from('newpage_tools').upsert({ member_id: member.id, tool: b.tool, data, updated_at: new Date().toISOString() }, { onConflict: 'member_id,tool' })
      return res.json({ data })
    }

    case 'compass_suggest': {
      const task = COMPASS_TASKS[b.kind]
      if (!task) return res.status(400).json({ error: 'Unknown suggestion.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Suggestions aren’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 40, windowMs: 60 * 60 * 1000, key: `np-compass-${member.id}` })) return
      try {
        const compass = cleanCompass(b.compass)
        const out = await askJson({ system: COMPASS_SYSTEM, prompt: task.prompt(compass, b.data || {}), schema: task.schema })
        return res.json({ result: task.read(out) })
      } catch (err) {
        console.error('Compass suggestion failed:', err)
        return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
      }
    }

    // ── Resume and cover letter ──
    case 'doc_list': {
      const { data } = await supabase.from('newpage_docs').select('id, kind, title, content, created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(20)
      return res.json({ docs: data || [] })
    }
    case 'doc_delete':
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
      await supabase.from('newpage_docs').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json({ ok: true })
    case 'doc_generate': {
      const kind = b.kind === 'cover' ? 'cover' : b.kind === 'resume' ? 'resume' : null
      if (!kind) return res.status(400).json({ error: 'Choose a resume or a cover letter.' })
      const background = clipText(b.background, 12000)
      if (background.length < 80) return res.status(400).json({ error: 'Paste your work history first: your roles, dates and what you achieved. A page or so is plenty.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 12, windowMs: 60 * 60 * 1000, key: `np-doc-${member.id}` })) return
      const job = clipText(b.job, 6000), company = clipText(b.company, 120), role = clipText(b.role, 120)
      await supabase.from('newpage_tools').upsert({ member_id: member.id, tool: 'profile', data: { text: background }, updated_at: new Date().toISOString() }, { onConflict: 'member_id,tool' })
      let content
      try {
        if (kind === 'resume') {
          content = cleanResume(await askJson({ system: DOC_SYSTEM, prompt: resumePrompt({ background, job }), schema: RESUME_SCHEMA, maxTokens: 4000 }))
        } else {
          const { data: last } = await supabase.from('newpage_docs').select('content').eq('member_id', member.id).eq('kind', 'resume').order('created_at', { ascending: false }).limit(1)
          const resume = last?.[0]?.content ? JSON.stringify(last[0].content).slice(0, 5000) : ''
          content = cleanCover(await askJson({ system: DOC_SYSTEM, prompt: coverPrompt({ background, job, name: member.name || '', company, role, resume }), schema: COVER_SCHEMA, maxTokens: 2000 }))
        }
      } catch (err) {
        console.error('Document failed:', err)
        return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
      }
      const title = docTitle(kind, content, role, company)
      const { data: saved } = await supabase.from('newpage_docs').insert({ member_id: member.id, kind, title, content }).select('id, kind, title, content, created_at').single()
      return res.json({ doc: saved || { kind, title, content } })
    }

    case 'task_toggle':
    case 'task_delete': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown task.' })
      const q = supabase.from('newpage_tasks')
      if (b.action === 'task_delete') await q.delete().eq('id', b.id).eq('member_id', member.id)
      else await q.update({ done: !!b.done }).eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member, coachOf(b.coach)))
    }

    case 'session_booked':
      await supabase.from('newpage_members').update({ session_booked: !!b.booked }).eq('id', member.id)
      return res.json(await me({ ...member, session_booked: !!b.booked }, coachOf(b.coach)))

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
      return res.json({ ...(await me(updated, coachOf(b.coach))), result: { quadrant: r.quadrant, clarity: r.clarity, capacity: r.capacity, struggling: answers.feel === 5, lowMood: answers.feel === 4 } })
    }

    case 'memory_delete': {
      if (b.all) await supabase.from('newpage_memory').delete().eq('member_id', member.id)
      else if (ID_RE.test(String(b.id))) await supabase.from('newpage_memory').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member, coachOf(b.coach)))
    }

    case 'coach_clear': {
      const coach = coachOf(b.coach)
      await supabase.from('newpage_messages').delete().eq('member_id', member.id).eq('coach', coach)
      return res.json(await me(member, coach))
    }

    case 'coach': {
      const coach = coachOf(b.coach)
      if (!rateLimit(req, res, { max: 40, windowMs: 60 * 60 * 1000, key: `np-coach-${member.id}` })) return
      const text = clip(b.message, 2000)
      if (!text) return res.status(400).json({ error: 'Type a message first.' })

      // Safety first: this runs on every message, whatever the model would say.
      if (detectCrisis(text)) {
        await supabase.from('newpage_messages').insert([{ member_id: member.id, coach, role: 'user', content: text }, { member_id: member.id, coach, role: 'assistant', content: CRISIS_REPLY }])
        return res.json({ ...(await me(member, coach)), crisis: true })
      }
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The coach isn’t switched on yet. Everything else in New Page works.', code: 'coach_off' })

      const data = await load(member.id, coach)
      const { data: cp } = await supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', 'compass').maybeSingle()
      const system = coachSystem({ member, tasks: data.tasks, memory: data.memory, compass: cp?.data ? cleanCompass(cp.data) : null, coach })
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
      await supabase.from('newpage_messages').insert([{ member_id: member.id, coach, role: 'user', content: text }, { member_id: member.id, coach, role: 'assistant', content: reply.text }])
      return res.json({ ...(await me(member, coach)), usedTools: reply.used.map(u => u.name) })
    }

    default:
      return res.status(400).json({ error: 'Unknown action' })
  }
}
