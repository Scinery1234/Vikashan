import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'
import { requireMember } from '../../lib/newpage-auth.js'
import { QUADRANTS, score } from '../../newpage/quiz-logic.js'
import { PROGRAM } from '../../newpage/program-content.js'
import { buildMe, cleanCheckin, detectCrisis, CRISIS_REPLY, PROGRAM_WEEKS } from '../../lib/newpage-app.js'
import { coachSystem, toApiMessages, runCoach, askJson } from '../../lib/newpage-coach.js'
import { isCoach } from '../../lib/newpage-coaches.js'
import { refreshContent } from '../../lib/newpage-content.js'
import { getAvailableSlots } from '../../lib/availability.js'
import { sessionState, bookingProblem } from '../../lib/newpage-members.js'
import { sendConfirmation } from '../../lib/resend.js'
import { stripe, renewSessionParams, hoursSessionParams } from '../../lib/newpage-stripe.js'
import { cleanHours } from '../../lib/newpage-pricing.js'
import { createOutlookEvent } from '../../lib/outlook.js'
import { createGoogleCalendarEvent } from '../../lib/google-calendar.js'
import {
  COMPASS_SYSTEM, COMPASS_TASKS, cleanCompass,
  clipText,
  SECTION_SYSTEM, SECTIONS_SCHEMA, SECTION_KINDS, cleanSections, cleanFields, memberContext
} from '../../lib/newpage-tools.js'
import { cleanStoredResume, resumeTitle, resumeText, resumeContact } from '../../lib/newpage-resume.js'
import { COVER_SYSTEM, COVER_SCHEMA, analyseJob, buildCoverPrompt, analysePrompt, ANALYSE_SCHEMA, cleanAnalysis, cleanCover, cleanEvidence, coverTitle, sydneyDate } from '../../lib/newpage-cover.js'

const COVER_TEMPLATES = ['modern', 'classic', 'creative', 'minimal', 'executive']
const cleanTemplate = v => (COVER_TEMPLATES.includes(v) ? v : 'modern')
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[0-9a-f-]{36}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const coachOf = v => (typeof v === 'string' && isCoach(v) ? v : 'career')
const cleanDate = v => (typeof v === 'string' && DATE_RE.test(v) ? v : null)
const cleanTime = v => (typeof v === 'string' && TIME_RE.test(v) ? v : null)
const cleanMins = v => (Number.isInteger(Number(v)) && Number(v) >= 5 && Number(v) <= 600 ? Number(v) : null)

async function load(memberId, coach = 'career') {
  const [progress, tasks, checkins, memory, messages, goals, bookings] = await Promise.all([
    supabase.from('newpage_progress').select('week, step').eq('member_id', memberId),
    supabase.from('newpage_tasks').select('id, title, due, done, source, created_at, block_start, block_mins, goal_id').eq('member_id', memberId).order('created_at', { ascending: true }).limit(200),
    supabase.from('newpage_checkins').select('clarity, capacity, quadrant, created_at').eq('member_id', memberId).order('created_at', { ascending: true }).limit(60),
    supabase.from('newpage_memory').select('id, note').eq('member_id', memberId).order('created_at', { ascending: true }).limit(60),
    supabase.from('newpage_messages').select('role, content, created_at').eq('member_id', memberId).eq('coach', coach).order('id', { ascending: false }).limit(40),
    supabase.from('newpage_goals').select('id, title, target, done').eq('member_id', memberId).order('created_at', { ascending: true }).limit(50),
    supabase.from('bookings').select('id, date, start_time, status').eq('newpage_member_id', memberId).limit(100)
  ])
  return {
    progress: progress.data || [], goals: goals.data || [], bookings: bookings.data || [],
    tasks: (tasks.data || []).map(t => ({ id: t.id, title: t.title, due: t.due, done: t.done, source: t.source, goalId: t.goal_id || null, start: t.block_start ? String(t.block_start).slice(0, 5) : null, mins: t.block_mins || null })), checkins: checkins.data || [], memory: memory.data || [],
    messages: (messages.data || []).reverse()
  }
}

async function me(member, coach = 'career') {
  const data = await load(member.id, coach)
  return { ...buildMe({ member, ...data, sessions: sessionState(member.sessions_included, data.bookings), coachOn: !!process.env.ANTHROPIC_API_KEY }), coach }
}

// One endpoint for everything a signed-in member does: POST { action, ... }
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  const member = await requireMember(req, res)
  if (!member) return
  await refreshContent()
  const b = req.body || {}

  switch (b.action) {
    case 'me':
      return res.json(await me(member, coachOf(b.coach)))

    case 'progress': {
      const week = Number(b.week), step = Number(b.step)
      const plan = member.quadrant ? PROGRAM[member.quadrant] : null
      if (!plan || !Number.isInteger(week) || week < 1 || week > PROGRAM_WEEKS || !Number.isInteger(step) || step < 0 || step >= plan[week - 1].tasks.length) {
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

    // ── Notes: a private place for the member to type and work things out ──
    case 'note_list': {
      const { data } = await supabase.from('newpage_notes').select('id, title, body, updated_at').eq('member_id', member.id).order('updated_at', { ascending: false }).limit(100)
      return res.json({ notes: data || [] })
    }
    case 'note_save': {
      const title = clip(b.title, 120), body = clipText(b.body, 30000)
      const now = new Date().toISOString()
      if (b.id) {
        if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown note.' })
        const { data } = await supabase.from('newpage_notes').update({ title, body, updated_at: now }).eq('id', b.id).eq('member_id', member.id).select('id, title, body, updated_at').maybeSingle()
        if (!data) return res.status(404).json({ error: 'That note is gone.' })
        return res.json({ note: data })
      }
      const { count } = await supabase.from('newpage_notes').select('id', { count: 'exact', head: true }).eq('member_id', member.id)
      if ((count || 0) >= 100) return res.status(400).json({ error: 'You have 100 notes. Delete one to make room.' })
      const { data } = await supabase.from('newpage_notes').insert({ member_id: member.id, title, body, updated_at: now }).select('id, title, body, updated_at').single()
      return res.json({ note: data })
    }
    case 'note_delete':
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown note.' })
      await supabase.from('newpage_notes').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json({ ok: true })

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
      if (SECTION_KINDS[b.kind]) {
        const SK = SECTION_KINDS[b.kind]
        if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
        if (!rateLimit(req, res, { max: 12, windowMs: 60 * 60 * 1000, key: `np-doc-${member.id}` })) return
        const fields = cleanFields(b.kind, b.fields)
        const background = clipText(b.background, 12000)
        if (b.kind === 'linkedin' && background) await supabase.from('newpage_tools').upsert({ member_id: member.id, tool: 'profile', data: { text: background }, updated_at: new Date().toISOString() }, { onConflict: 'member_id,tool' })
        const [data, cp, pr] = await Promise.all([
          load(member.id),
          supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', 'compass').maybeSingle(),
          supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', 'profile').maybeSingle()
        ])
        const profile = ['linkedin', 'report', 'progress', 'brief'].includes(b.kind) ? (background || clipText(pr.data?.data?.text, 4000)) : ''
        const ctx = memberContext({
          member, compass: cp.data?.data, checkins: data.checkins, memory: data.memory, doneCount: data.progress.length,
          taskDone: data.tasks.filter(t => t.done).length, profile
        })
        const problem = SK.needs(ctx, fields, profile)
        if (problem) return res.status(400).json({ error: problem })
        let content
        try {
          content = cleanSections(await askJson({ system: SECTION_SYSTEM, prompt: SK.prompt(ctx, fields), schema: SECTIONS_SCHEMA, maxTokens: 4500 }))
        } catch (err) {
          console.error('Document failed:', err)
          return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
        }
        if (!content.sections.length) return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
        const title = (content.title || SK.label).slice(0, 160)
        const { data: saved } = await supabase.from('newpage_docs').insert({ member_id: member.id, kind: b.kind, title, content }).select('id, kind, title, content, created_at').single()
        return res.json({ doc: saved || { kind: b.kind, title, content } })
      }
      if (b.kind === 'resume') return res.status(400).json({ error: 'Resumes are written in the Resume writer.' })
      if (b.kind !== 'cover') return res.status(400).json({ error: 'Choose a document type.' })
      const kind = 'cover'
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      const job = clipText(b.job, 8000), company = clipText(b.company, 120), role = clipText(b.role, 120)
      const template = cleanTemplate(b.template)
      let content, title
      {
        if (job.length < 60) return res.status(400).json({ error: 'Paste the job ad first.' })
        if (!rateLimit(req, res, { max: 12, windowMs: 60 * 60 * 1000, key: `np-doc-${member.id}` })) return
        const [pr, last] = await Promise.all([
          supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', 'profile').maybeSingle(),
          supabase.from('newpage_docs').select('content').eq('member_id', member.id).eq('kind', 'resume').order('created_at', { ascending: false }).limit(1)
        ])
        const lastResume = last.data?.[0]?.content || null
        const resume = clipText(b.resume, 20000) || (lastResume ? resumeText(lastResume) : clipText(pr.data?.data?.text, 12000))
        if (resume.length < 80) return res.status(400).json({ error: 'Add your resume first. Write or upload it in the Resume writer, then come back.' })
        const { keywords, requirements } = analyseJob(job)
        const keep = Array.isArray(b.keywords) ? b.keywords.map(k => clip(k, 60)).filter(Boolean).slice(0, 15) : keywords
        const prev = lastResume ? resumeContact(lastResume) : {}
        const name = clip(b.name, 100) || member.name || prev.name || ''
        const candidate = { name, currentTitle: clip(b.currentTitle, 120), years: clip(b.years, 20), role, company, why: clipText(b.why, 2000), unique: clipText(b.unique, 2000), resume }
        let out
        try {
          out = await askJson({ system: COVER_SYSTEM, prompt: buildCoverPrompt({ candidate, job, keywords: keep, requirements, evidence: cleanEvidence(b.evidence) }), schema: COVER_SCHEMA, maxTokens: 3500 })
        } catch (err) {
          console.error('Cover letter failed:', err)
          return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
        }
        const k = (b.contact && typeof b.contact === 'object') ? b.contact : {}
        content = cleanCover(out, {
          name, template,
          contact: { phone: clip(k.phone, 40) || prev.phone, email: clip(k.email, 120) || prev.email || member.email, location: clip(k.location, 100) || prev.location, linkedin: clip(k.linkedin, 200) || prev.linkedin },
          date: sydneyDate(), recipient: ['Hiring Manager', company].filter(Boolean)
        })
        if (content.paragraphs.length < 2) return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
        if (!content.subject && role) content.subject = `Application for ${role}`
        title = coverTitle(role, company)
      }
      const { data: saved } = await supabase.from('newpage_docs').insert({ member_id: member.id, kind, title, content }).select('id, kind, title, content, created_at').single()
      return res.json({ doc: saved || { kind, title, content } })
    }

    // The resume writer (api/newpage/resume.py) finished and validated a Word file: keep the approved resume.
    case 'resume_save': {
      const content = cleanStoredResume(b)
      if (!content.resume.candidate.full_name) return res.status(400).json({ error: 'That resume has no name on it.' })
      const title = resumeTitle(content)
      if (b.id) {
        if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
        const { data } = await supabase.from('newpage_docs').update({ title, content }).eq('id', b.id).eq('member_id', member.id).eq('kind', 'resume').select('id, kind, title, content, created_at').maybeSingle()
        if (data) return res.json({ doc: data })
      }
      const { data: saved } = await supabase.from('newpage_docs').insert({ member_id: member.id, kind: 'resume', title, content }).select('id, kind, title, content, created_at').single()
      return res.json({ doc: saved || { kind: 'resume', title, content } })
    }
    case 'doc_template': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
      const { data: doc } = await supabase.from('newpage_docs').select('id, kind, title, content, created_at').eq('id', b.id).eq('member_id', member.id).maybeSingle()
      if (!doc || doc.kind !== 'cover') return res.status(404).json({ error: 'Unknown document.' })
      const content = { ...doc.content, template: cleanTemplate(b.template) }
      await supabase.from('newpage_docs').update({ content }).eq('id', doc.id).eq('member_id', member.id)
      return res.json({ doc: { ...doc, content } })
    }
    // The member edited their cover letter text by hand; keep it.
    case 'doc_save': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
      const { data: doc } = await supabase.from('newpage_docs').select('id, kind, title, content, created_at').eq('id', b.id).eq('member_id', member.id).maybeSingle()
      if (!doc || doc.kind !== 'cover') return res.status(404).json({ error: 'Unknown document.' })
      const d = b.content && typeof b.content === 'object' ? b.content : {}
      const content = cleanCover(d, { name: doc.content.name, contact: doc.content.contact, date: doc.content.date, recipient: doc.content.recipient, template: doc.content.template })
      if (content.paragraphs.length < 1) return res.status(400).json({ error: 'A letter needs at least one paragraph.' })
      await supabase.from('newpage_docs').update({ content }).eq('id', doc.id).eq('member_id', member.id)
      return res.json({ doc: { ...doc, content } })
    }
    case 'cover_analyse': {
      const job = clipText(b.job, 8000)
      if (job.length < 60) return res.status(400).json({ error: 'Paste the whole job ad first.' })
      const fallback = analyseJob(job)
      if (!process.env.ANTHROPIC_API_KEY) return res.json(fallback)
      if (!rateLimit(req, res, { max: 30, windowMs: 60 * 60 * 1000, key: `np-cover-${member.id}` })) return
      try {
        const out = await askJson({ system: COVER_SYSTEM, prompt: analysePrompt(job), schema: ANALYSE_SCHEMA, maxTokens: 1200 })
        const r = cleanAnalysis(out)
        return res.json(r.keywords.length >= 3 ? r : fallback)
      } catch (err) {
        console.error('Ad analysis failed, using the simple reader:', err)
        return res.json(fallback)
      }
    }

    case 'task_toggle':
    case 'task_delete': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown task.' })
      const q = supabase.from('newpage_tasks')
      if (b.action === 'task_delete') await q.delete().eq('id', b.id).eq('member_id', member.id)
      else await q.update({ done: !!b.done }).eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member, coachOf(b.coach)))
    }

    // ── The included 1:1 session with Vik ──
    case 'slots': {
      const date = String(b.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Choose a date.' })
      const { slots } = await getAvailableSlots(date)
      return res.json({ date, slots: slots.filter(sl => !bookingProblem(date, sl.hour)) })
    }
    case 'session_book': {
      if (!rateLimit(req, res, { max: 10, windowMs: 60 * 60 * 1000, key: `np-session-${member.id}` })) return
      const date = String(b.date || ''), hour = Number(b.hour)
      const problem = bookingProblem(date, hour)
      if (problem) return res.status(400).json({ error: problem })
      const state = sessionState(member.sessions_included, (await load(member.id)).bookings)
      if (state.remaining < 1) return res.status(403).json({ error: 'You’ve used the session included in New Page. Reply to any email from Vik to add more hours.', code: 'no_sessions' })
      const { slots } = await getAvailableSlots(date)
      if (!slots.some(sl => sl.hour === hour)) return res.status(409).json({ error: 'Sorry, that time was just taken. Please choose another.', code: 'taken' })
      const { data: type } = await supabase.from('session_types').select('*').eq('name', 'New Page 1:1 session').maybeSingle()
      if (!type) return res.status(500).json({ error: 'Session booking isn’t set up yet. Please email Vik.' })

      let { data: client } = await supabase.from('clients').select('*').eq('email', member.email).maybeSingle()
      if (!client) ({ data: client } = await supabase.from('clients').insert({ name: member.name || member.email, email: member.email, status: 'active' }).select().single())
      if (!client) return res.status(500).json({ error: 'Could not book that. Please try again.' })

      const time = `${String(hour).padStart(2, '0')}:00`
      const { data: booking, error } = await supabase.from('bookings').insert({
        client_id: client.id, session_type_id: type.id, date, start_time: time, duration_mins: type.duration_mins,
        meet_link: process.env.ZOOM_PERSONAL_LINK, amount_cents: 0, tier: 'free', status: 'confirmed', newpage_member_id: member.id,
        notes: 'New Page included session'
      }).select().single()
      if (error || !booking) { console.error('Session booking failed:', error); return res.status(500).json({ error: 'Could not book that. Please try again.' }) }
      await supabase.from('newpage_members').update({ session_booked: true }).eq('id', member.id)

      const confirmed = { ...booking, session_type_name: type.name }
      try {
        await Promise.all([
          sendConfirmation({ booking: confirmed, client, zoomLink: booking.meet_link }),
          createOutlookEvent({ booking: confirmed, client, meetLink: booking.meet_link }),
          createGoogleCalendarEvent({ booking: confirmed, client, meetLink: booking.meet_link })
        ])
      } catch (err) { console.error('Session confirmation failed:', err) }
      return res.json({ ...(await me({ ...member, session_booked: true }, coachOf(b.coach))), booked: { date, time } })
    }

    // ── Paying for more: another month, or extra hours with Vik ──
    case 'renew_checkout':
    case 'hours_checkout': {
      if (!rateLimit(req, res, { max: 10, windowMs: 60 * 60 * 1000, key: `np-buy-${member.id}` })) return
      if (member.source === 'scholarship') return res.status(403).json({ error: 'Scholarship places can’t be renewed here. Reply to any email from Vik to talk about it.', code: 'scholarship' })
      const hours = b.action === 'hours_checkout' ? cleanHours(b.hours) : 0
      if (b.action === 'hours_checkout' && !hours) return res.status(400).json({ error: 'Choose between 1 and 8 hours.' })
      try {
        const params = b.action === 'renew_checkout' ? renewSessionParams({ member }) : hoursSessionParams({ member, hours })
        const session = await stripe().checkout.sessions.create(params)
        return res.json({ url: session.url })
      } catch (err) {
        console.error('Checkout failed:', err)
        return res.status(502).json({ error: 'We couldn’t start the payment. Please try again in a minute.' })
      }
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
