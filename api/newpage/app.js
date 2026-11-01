import { supabase } from '../../lib/supabase.js'
import { rateLimit } from '../../lib/security.js'
import { requireMember } from '../../lib/newpage-auth.js'
import { QUADRANTS, score } from '../../newpage/quiz-logic.js'
import { PROGRAM } from '../../newpage/program-content.js'
import { buildMe, cleanCheckin, detectCrisis, CRISIS_REPLY, PROGRAM_WEEKS, programPosition } from '../../lib/newpage-app.js'
import { coachSystem, toApiMessages, runCoach, askJson, aiMessage, WRITER_MODEL } from '../../lib/newpage-coach.js'
import { isCoach } from '../../lib/newpage-coaches.js'
import { refreshContent } from '../../lib/newpage-content.js'
import { exportMemory, eraseMemory } from '../../lib/newpage-memory-store.js'
import { openVault, sealText, openText, sealJson, openJson, memoryUsable } from '../../lib/newpage-vault.js'
import { cryptoReady } from '../../lib/newpage-crypto.js'
import { checkDue, checkPrompt, CHECK_SCHEMA, cleanCheck } from '../../lib/newpage-principles.js'
import { isDemo, demoAllowance, demoSpend } from '../../lib/newpage-demo.js'
import { isTools, usageAllowance, usageSpend, usageFor, TOOLS_CAPS } from '../../lib/newpage-usage.js'
import { billingPortalUrl } from '../../lib/newpage-stripe.js'
import { PRIVACY_TEXT, cleanPrivacy, ABOUT, cleanAbout, aboutLines, cleanNote, MEMORY_LIMIT, isDuplicateNote, CHAT_SHARE_LIMIT } from '../../lib/newpage-context.js'
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
import { TAILOR_SYSTEM, TAILOR_SCHEMA, tailorPrompt, cleanTailor, tailoredTitle, tailorNote } from '../../lib/newpage-tailor.js'
import { COVER_SYSTEM, COVER_SCHEMA, analyseJob, buildCoverPrompt, analysePrompt, ANALYSE_SYSTEM, ANALYSE_SCHEMA, cleanAnalysis, GAPS_SCHEMA, gapsPrompt, cleanGaps, REVIEW_SYSTEM, REVIEW_SCHEMA, reviewPrompt, cleanReview, coverText, revisePrompt, cleanAnswers, cleanCover, cleanEvidence, coverTitle, sydneyDate } from '../../lib/newpage-cover.js'

const COVER_TEMPLATES = ['modern', 'classic', 'creative', 'minimal', 'executive']
const cleanTemplate = v => (COVER_TEMPLATES.includes(v) ? v : 'modern')
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[0-9a-f-]{36}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const COACH_NAME = id => ({ career: 'Career', recovery: 'Recovery', action: 'Action', exec: 'Executive function', charge: 'Reducing the charge', cbt: 'CBT', interview: 'Interview', offer: 'Offer and negotiation', clarity: 'Clarity compass' }[id] || id)
const coachOf = v => (typeof v === 'string' && isCoach(v) ? v : 'career')
const cleanDate = v => (typeof v === 'string' && DATE_RE.test(v) ? v : null)
const cleanTime = v => (typeof v === 'string' && TIME_RE.test(v) ? v : null)
const cleanMins = v => (Number.isInteger(Number(v)) && Number(v) >= 5 && Number(v) <= 600 ? Number(v) : null)

// A vault to write with. If encryption is switched on but this member's key can't be
// opened, refuse rather than store anything unencrypted.
async function writeVault(member) {
  const v = await openVault(member, { create: true })
  if (cryptoReady() && !v) throw Object.assign(new Error('Private storage isn’t available right now. Please try again later.'), { status: 503 })
  return v
}
// The Compass is program work and stays as it is. The resume and the "about you"
// answers are part of Sky's memory, so they are encrypted with the member's key.
const PRIVATE_TOOLS = ['profile', 'about', 'steer']
async function getTool(member, tool) {
  const { data } = await supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', tool).maybeSingle()
  return PRIVATE_TOOLS.includes(tool) ? openJson(await openVault(member), `tool:${tool}`, data?.data) : data?.data
}
async function setTool(member, tool, value) {
  const v = PRIVATE_TOOLS.includes(tool) ? await writeVault(member) : null
  await supabase.from('newpage_tools').upsert({ member_id: member.id, tool, data: sealJson(v, `tool:${tool}`, value), updated_at: new Date().toISOString() }, { onConflict: 'member_id,tool' })
}

async function load(member, coach = 'career') {
  const memberId = member.id
  const vault = await openVault(member)
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
    tasks: (tasks.data || []).map(t => ({ id: t.id, title: t.title, due: t.due, done: t.done, source: t.source, goalId: t.goal_id || null, start: t.block_start ? String(t.block_start).slice(0, 5) : null, mins: t.block_mins || null })), checkins: checkins.data || [],
    memory: (memory.data || []).map(m => ({ id: m.id, note: openText(vault, 'mem', m.note) })),
    messages: (messages.data || []).map(m => ({ ...m, content: openText(vault, 'msg', m.content) })).reverse()
  }
}

// The resume the cover letter writer works from: what the member pasted or uploaded just
// now, else the resume approved in the Resume writer, else the background text saved there.
// A saved resume can be named (resumeId), for a letter written from a tailored version.
async function memberResume(member, pasted, resumeId = '') {
  const pick = ID_RE.test(String(resumeId || ''))
  const [pr, last] = await Promise.all([
    supabase.from('newpage_tools').select('data').eq('member_id', member.id).eq('tool', 'profile').maybeSingle(),
    pick
      ? supabase.from('newpage_docs').select('content').eq('member_id', member.id).eq('kind', 'resume').eq('id', String(resumeId)).limit(1)
      : supabase.from('newpage_docs').select('content').eq('member_id', member.id).eq('kind', 'resume').order('created_at', { ascending: false }).limit(1)
  ])
  const lastResume = last.data?.[0]?.content || null
  const resume = clipText(pasted, 20000) || (lastResume ? resumeText(lastResume) : clipText(pr.data?.data?.text, 12000))
  return { resume, lastResume }
}

async function me(member, coach = 'career') {
  const data = await load(member, coach)
  const usage = isTools(member) ? { used: await usageFor(member.id), caps: TOOLS_CAPS } : null
  return { ...buildMe({ member, ...data, sessions: sessionState(member.sessions_included, data.bookings), coachOn: !!process.env.ANTHROPIC_API_KEY }), coach, usage }
}

// Everything the Your context screen shows. Shares are listed by date and kind only.
async function contextOf(member, coach = 'career') {
  const [aboutRaw, profile, shares, views, loaded] = await Promise.all([
    getTool(member, 'about'), getTool(member, 'profile'),
    supabase.from('newpage_shares').select('id, kind, created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(30),
    supabase.from('newpage_access_log').select('what, created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(10),
    load(member, coach)
  ])
  return {
    ready: cryptoReady(), privacy: member.privacy || null, privacyText: PRIVACY_TEXT, learn: member.learn !== false,
    questions: ABOUT, about: cleanAbout(aboutRaw), resume: { has: !!profile?.text, text: clipText(profile?.text, 12000) },
    notes: loaded.memory, shares: shares.data || [], views: views.data || [], limit: MEMORY_LIMIT
  }
}

// One endpoint for everything a signed-in member does: POST { action, ... }
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  const member = await requireMember(req, res)
  if (!member) return
  await refreshContent()
  const b = req.body || {}

  // Sky and the tools ($25 a month): no 1:1 sessions or program renewals, and fair-use limits.
  if (isTools(member)) {
    if (['renew_checkout', 'hours_checkout', 'session_book'].includes(b.action)) return res.status(403).json({ error: 'That’s part of the four-week New Page program, which includes a human coach. Your membership covers Sky and the tools.', code: 'tools' })
    const kind = b.action === 'coach' ? 'messages' : b.action === 'resume_tailor' ? 'tailored' : (b.action === 'cover_draft' || (b.action === 'doc_generate' && b.kind === 'cover')) ? 'covers' : null
    if (kind) {
      const a = await usageAllowance(member, kind)
      if (!a.ok) return res.status(429).json({ error: a.why, code: 'usage_cap', used: a.used, cap: a.cap })
      await usageSpend(member, kind)
    }
    if (b.action === 'billing_portal') {
      if (!member.stripe_customer_id) return res.status(400).json({ error: 'We can’t find your billing details. Reply to any email from us and we’ll sort it out.' })
      try { return res.json({ url: await billingPortalUrl(member.stripe_customer_id) }) } catch (err) { console.error('Billing portal failed:', err); return res.status(502).json({ error: 'Billing isn’t available just now. Please try again in a minute.' }) }
    }
  }

  // The demo: no money, no bookings, no emails, and a small AI allowance.
  if (isDemo(member)) {
    if (['renew_checkout', 'hours_checkout', 'session_book', 'reminders_set', 'program_emails_set', 'share_chat', 'share_context'].includes(b.action)) {
      return res.status(403).json({ error: 'That part isn’t in the demo. Join New Page to use it.', code: 'demo' })
    }
    if (b.action === 'coach' || (b.action === 'doc_generate') || b.action === 'doc_edit' || b.action === 'compass_suggest') {
      const kind = b.action === 'coach' ? 'messages' : 'docs'
      const a = await demoAllowance(member.id, kind)
      if (!a.ok) return res.status(429).json({ error: a.why, code: 'demo_cap', used: a.used, cap: a.cap })
      await demoSpend(member.id, kind) // counted when asked, so a visitor can’t run up a bill with failed calls
      member[kind === 'docs' ? 'demo_docs' : 'demo_messages'] = (member[kind === 'docs' ? 'demo_docs' : 'demo_messages'] || 0) + 1
    }
  }

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
    case 'program_emails_set':
      await supabase.from('newpage_members').update({ program_emails: !!b.on }).eq('id', member.id)
      return res.json(await me({ ...member, program_emails: !!b.on }, coachOf(b.coach)))
    case 'reminders_set':
      await supabase.from('newpage_members').update({ reminders: !!b.on }).eq('id', member.id)
      return res.json(await me({ ...member, reminders: !!b.on }, coachOf(b.coach)))

    // ── Saved tool state (Compass answers, resume background) ──
    case 'tool_get': {
      if (!['compass', 'profile'].includes(b.tool)) return res.status(400).json({ error: 'Unknown tool.' })
      const d = await getTool(member, b.tool)
      return res.json({ data: b.tool === 'compass' ? cleanCompass(d) : { text: clipText(d?.text, 12000) } })
    }
    case 'tool_save': {
      if (!['compass', 'profile'].includes(b.tool)) return res.status(400).json({ error: 'Unknown tool.' })
      const data = b.tool === 'compass' ? cleanCompass(b.data) : { text: clipText(b.data?.text, 12000) }
      await setTool(member, b.tool, data)
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
        return res.status(502).json({ error: aiMessage(err) })
      }
    }

    // ── Notes: a private place for the member to type and work things out ──
    case 'note_list': {
      const { data } = await supabase.from('newpage_notes').select('id, title, body, updated_at').eq('member_id', member.id).order('updated_at', { ascending: false }).limit(100)
      const v = await openVault(member)
      return res.json({ notes: (data || []).map(n => ({ ...n, title: openText(v, 'note:title', n.title), body: openText(v, 'note:body', n.body) })) })
    }
    case 'note_save': {
      const title = clip(b.title, 120), body = clipText(b.body, 30000)
      const now = new Date().toISOString()
      const v = await writeVault(member)
      const sealN = n => ({ ...n, title: openText(v, 'note:title', n.title), body: openText(v, 'note:body', n.body) })
      if (b.id) {
        if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown note.' })
        const { data } = await supabase.from('newpage_notes').update({ title: sealText(v, 'note:title', title), body: sealText(v, 'note:body', body), updated_at: now }).eq('id', b.id).eq('member_id', member.id).select('id, title, body, updated_at').maybeSingle()
        if (!data) return res.status(404).json({ error: 'That note is gone.' })
        return res.json({ note: sealN(data) })
      }
      const { count } = await supabase.from('newpage_notes').select('id', { count: 'exact', head: true }).eq('member_id', member.id)
      if ((count || 0) >= 100) return res.status(400).json({ error: 'You have 100 notes. Delete one to make room.' })
      const { data } = await supabase.from('newpage_notes').insert({ member_id: member.id, title: sealText(v, 'note:title', title), body: sealText(v, 'note:body', body), updated_at: now }).select('id, title, body, updated_at').single()
      return res.json({ note: sealN(data) })
    }
    case 'note_delete':
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown note.' })
      await supabase.from('newpage_notes').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json({ ok: true })

    // ── Resume and cover letter ──
    case 'doc_list': {
      const { data } = await supabase.from('newpage_docs').select('id, kind, title, content, created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(80)
      return res.json({ docs: data || [] })
    }
    // The member names a saved resume or letter themselves (the app's own titles repeat).
    case 'doc_rename': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
      const title = clip(b.title, 80).replace(/\s+/g, ' ')
      if (title.length < 2) return res.status(400).json({ error: 'Give it a name of at least two characters.' })
      const { data } = await supabase.from('newpage_docs').update({ title }).eq('id', b.id).eq('member_id', member.id).select('id, kind, title, content, created_at').maybeSingle()
      if (!data) return res.status(404).json({ error: 'Unknown document.' })
      return res.json({ doc: data })
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
        if (b.kind === 'linkedin' && background) await setTool(member, 'profile', { text: background })
        const [data, cp, pr] = await Promise.all([
          load(member),
          getTool(member, 'compass'),
          getTool(member, 'profile')
        ])
        const ctx = memberContext({
          member, compass: cp, checkins: data.checkins, memory: data.memory, doneCount: data.progress.length,
          taskDone: data.tasks.filter(t => t.done).length, profile: ['linkedin', 'report', 'progress', 'brief'].includes(b.kind) ? (background || clipText(pr?.text, 4000)) : ''
        })
        const problem = SK.needs(ctx, fields)
        if (problem) return res.status(400).json({ error: problem })
        let content
        try {
          content = cleanSections(await askJson({ system: SECTION_SYSTEM, prompt: SK.prompt(ctx, fields), schema: SECTIONS_SCHEMA, maxTokens: 4500 }))
        } catch (err) {
          console.error('Document failed:', err)
          return res.status(502).json({ error: aiMessage(err) })
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
      const job = clipText(b.job, 12000), company = clipText(b.company, 120), role = clipText(b.role, 120)
      const template = cleanTemplate(b.template)
      let content, title
      {
        if (job.length < 60) return res.status(400).json({ error: 'Paste the job ad first.' })
        if (!rateLimit(req, res, { max: 12, windowMs: 60 * 60 * 1000, key: `np-doc-${member.id}` })) return
        const { resume, lastResume } = await memberResume(member, b.resume, b.resume_id)
        if (resume.length < 80) return res.status(400).json({ error: 'Add your resume first. Upload or paste it in step 1, or write it in the Resume writer.' })
        const simple = analyseJob(job)
        const strs = (v, n, len) => (Array.isArray(v) ? v.map(k => clip(k, len)).filter(Boolean).slice(0, n) : [])
        const keep = strs(b.keywords, 15, 60).length ? strs(b.keywords, 15, 60) : simple.keywords
        const requirements = strs(b.requirements, 8, 300).length ? strs(b.requirements, 8, 300) : simple.requirements
        const prev = lastResume ? resumeContact(lastResume) : {}
        const headName = (resume.split('\n').map(l => l.trim()).find(Boolean) || '').replace(/\s+/g, ' ')
        const fullName = /^[A-Za-z][A-Za-z'.-]+( [A-Za-z][A-Za-z'.-]+){1,3}$/.test(headName) ? headName.replace(/\b[A-Z]+\b/g, w => w[0] + w.slice(1).toLowerCase()) : ''
        const given = clip(b.name, 100) || member.name || prev.name || ''
        const name = (!given.includes(' ') && fullName) ? fullName : given
        const candidate = { name, currentTitle: clip(b.currentTitle, 120), years: clip(b.years, 20), role, company, why: clipText(b.why, 2000), unique: clipText(b.unique, 2000), resume }
        let out
        try {
          const draft = Array.isArray(b.draft) ? b.draft.map(x => clipText(x, 1800)).filter(Boolean).slice(0, 8) : null
          out = await askJson({ system: COVER_SYSTEM, prompt: buildCoverPrompt({ candidate, job, keywords: keep, requirements, evidence: cleanEvidence(b.evidence), draft: draft && draft.length ? draft : null }), schema: COVER_SCHEMA, maxTokens: 3500, model: WRITER_MODEL(), effort: 'high' })
        } catch (err) {
          console.error('Cover letter failed:', err)
          return res.status(502).json({ error: aiMessage(err) })
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

    // Tailor a saved resume for one job ad: one short call that selects, reorders and rewords
    // what is already true, and reports what changed and how the ad is matched. Saved as its
    // own resume under the one it came from. Counted as 'tailored' for tools members.
    case 'resume_tailor': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Choose the resume to tailor.' })
      const job = clipText(b.job, 20000), role = clip(b.role, 120), company = clip(b.company, 120)
      if (job.length < 60) return res.status(400).json({ error: 'Paste the whole job ad first.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 20, windowMs: 60 * 60 * 1000, key: `np-tailor-${member.id}` })) return
      const { data: baseDoc } = await supabase.from('newpage_docs').select('id, content').eq('id', b.id).eq('member_id', member.id).eq('kind', 'resume').maybeSingle()
      if (!baseDoc || !baseDoc.content?.resume?.candidate?.full_name) return res.status(404).json({ error: 'That resume isn’t one the Resume writer made, so it can’t be tailored. Open it in the Resume writer first.' })
      const base = baseDoc.content.resume
      let t
      try {
        const out = await askJson({ system: TAILOR_SYSTEM, prompt: tailorPrompt({ resume: JSON.stringify(base, null, 1), job, role, company }), schema: TAILOR_SCHEMA, maxTokens: 9000, model: WRITER_MODEL(), effort: 'medium' })
        t = cleanTailor(out, base)
      } catch (err) {
        console.error('Resume tailor failed:', err)
        return res.status(502).json({ error: aiMessage(err) })
      }
      if (t.unchanged) return res.status(502).json({ error: 'Nothing changed on that pass, which usually means the ad text didn’t come through. Check it and try again.' })
      const content = cleanStoredResume({
        resume: t.resume, target_title: role || t.resume.candidate.generic_job_title, job_description: job,
        tailored: { base_id: baseDoc.content.tailored?.base_id || baseDoc.id, role, company, summary: t.summary, changes: t.changes, match: t.match }
      })
      const title = tailoredTitle(role, company)
      const { data: saved } = await supabase.from('newpage_docs').insert({ member_id: member.id, kind: 'resume', title, content }).select('id, kind, title, content, created_at').single()
      return res.json({ doc: saved || { kind: 'resume', title, content } })
    }
    // The resume writer (api/newpage/resume.py) finished and validated a Word file: keep the approved resume.
    case 'resume_save': {
      const content = cleanStoredResume(b)
      if (!content.resume.candidate.full_name) return res.status(400).json({ error: 'That resume has no name on it.' })
      const title = clip(b.title, 80).replace(/\s+/g, ' ').length >= 2 ? clip(b.title, 80).replace(/\s+/g, ' ') : resumeTitle(content)
      if (b.id) {
        if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
        // A rebuilt resume keeps the name the member gave it.
        const { data } = await supabase.from('newpage_docs').update({ content, ...(b.title ? { title } : {}) }).eq('id', b.id).eq('member_id', member.id).eq('kind', 'resume').select('id, kind, title, content, created_at').maybeSingle()
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
    // Read the job ad against the member's resume: what the employer wants, what the
    // resume already shows, and one pointed question per theme for step 2.
    // Pass 1: read the job ad on its own and name the competencies it will assess.
    case 'cover_analyse': {
      const job = clipText(b.job, 12000)
      if (job.length < 60) return res.status(400).json({ error: 'Paste the whole job ad first.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 30, windowMs: 60 * 60 * 1000, key: `np-cover-${member.id}` })) return
      // No word-counting fallback here: a list of leftover words is worse than an honest error.
      try {
        const r = cleanAnalysis(await askJson({ system: ANALYSE_SYSTEM, prompt: analysePrompt(job), schema: ANALYSE_SCHEMA, maxTokens: 1500 }))
        if (r.themes.length < 3) throw new Error('Too few themes')
        return res.json(r)
      } catch (err) {
        console.error('Ad analysis failed:', err)
        return res.status(502).json({ error: 'We couldn’t read that ad properly. Please try again in a minute.' })
      }
    }
    // The first draft, from the resume and the ad alone, before any question is asked. Not saved.
    case 'cover_draft': {
      const job = clipText(b.job, 12000), company = clipText(b.company, 120), role = clipText(b.role, 120)
      if (job.length < 60) return res.status(400).json({ error: 'Paste the whole job ad first.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 12, windowMs: 60 * 60 * 1000, key: `np-doc-${member.id}` })) return
      const { resume, lastResume } = await memberResume(member, b.resume, b.resume_id)
      if (resume.length < 80) return res.status(400).json({ error: 'Add your resume first.', code: 'no_resume' })
      const strs = (v, n, len) => (Array.isArray(v) ? v.map(k => clip(k, len)).filter(Boolean).slice(0, n) : [])
      const prev = lastResume ? resumeContact(lastResume) : {}
      const candidate = { name: clip(b.name, 100) || member.name || prev.name || '', currentTitle: clip(b.currentTitle, 120), years: '', role, company, why: '', unique: '', resume }
      try {
        const out = await askJson({ system: COVER_SYSTEM, prompt: buildCoverPrompt({ candidate, job, keywords: strs(b.keywords, 15, 60), requirements: strs(b.requirements, 8, 300), draft: true }), schema: COVER_SCHEMA, maxTokens: 3500, model: WRITER_MODEL(), effort: 'high' })
        const c = cleanCover(out, { name: candidate.name })
        if (c.paragraphs.length < 2) throw new Error('Too short')
        return res.json({ draft: { subject: c.subject, greeting: c.greeting, paragraphs: c.paragraphs, closing: c.closing, signoff: c.signoff } })
      } catch (err) {
        console.error('Cover draft failed:', err)
        return res.status(502).json({ error: 'We couldn’t draft the letter just now. Please try again in a minute.' })
      }
    }
    // Revise a saved letter from the member's responses to the review. Replaces the letter in place.
    case 'cover_revise': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
      const answers = cleanAnswers(b.answers), note = clipText(b.note, 2000)
      if (!answers.length && !note) return res.status(400).json({ error: 'Respond to at least one point first.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 12, windowMs: 60 * 60 * 1000, key: `np-doc-${member.id}` })) return
      const [{ data: doc }, { resume }] = await Promise.all([
        supabase.from('newpage_docs').select('id, kind, title, content, created_at').eq('id', b.id).eq('member_id', member.id).maybeSingle(),
        memberResume(member, b.resume, b.resume_id)
      ])
      if (!doc || doc.kind !== 'cover') return res.status(404).json({ error: 'Unknown document.' })
      let content
      try {
        const out = await askJson({ system: COVER_SYSTEM, prompt: revisePrompt({ letter: coverText(doc.content), answers, note, job: clipText(b.job, 12000) || '(not given)', resume: clipText(resume, 12000) || '(not given)' }), schema: COVER_SCHEMA, maxTokens: 3500, model: WRITER_MODEL(), effort: 'high' })
        content = cleanCover(out, { name: doc.content.name, contact: doc.content.contact, date: doc.content.date, recipient: doc.content.recipient, template: doc.content.template })
      } catch (err) {
        console.error('Cover revise failed:', err)
        return res.status(502).json({ error: 'We couldn’t revise the letter just now. Please try again in a minute.' })
      }
      if (content.paragraphs.length < 2) return res.status(502).json({ error: 'That didn’t work. Please try again in a minute.' })
      if (!content.subject) content.subject = doc.content.subject
      await supabase.from('newpage_docs').update({ content }).eq('id', doc.id).eq('member_id', member.id)
      return res.json({ doc: { ...doc, content } })
    }
    // A recruiter's read of a finished letter: does it make the case, and what would make it stronger.
    case 'cover_review': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown document.' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 20, windowMs: 60 * 60 * 1000, key: `np-cover-${member.id}` })) return
      const [{ data: doc }, { resume }] = await Promise.all([
        supabase.from('newpage_docs').select('id, kind, content').eq('id', b.id).eq('member_id', member.id).maybeSingle(),
        memberResume(member, b.resume, b.resume_id)
      ])
      if (!doc || doc.kind !== 'cover') return res.status(404).json({ error: 'Unknown document.' })
      const ev = cleanEvidence(b.evidence).map(e => `${e.keyword}: ${[e.situation, e.result, e.award].filter(Boolean).join(' | ')}`).join('\n')
      const themes = Array.isArray(b.keywords) ? b.keywords.map(k => clip(k, 60)).filter(Boolean).slice(0, 15) : []
      try {
        const out = await askJson({ system: REVIEW_SYSTEM, prompt: reviewPrompt({ letter: coverText(doc.content), job: clipText(b.job, 12000) || '(not given)', resume: clipText(resume, 12000) || '(not given)', evidence: ev, themes }), schema: REVIEW_SCHEMA, maxTokens: 2500, model: WRITER_MODEL(), effort: 'high' })
        return res.json({ review: cleanReview(out) })
      } catch (err) {
        console.error('Cover review failed:', err)
        return res.status(502).json({ error: 'We couldn’t review the letter just now. Please try again in a minute.' })
      }
    }
    // Pass 2: check the resume against those competencies and write one question for each.
    case 'cover_gaps': {
      const themes = cleanAnalysis({ themes: b.themes }).themes
      if (themes.length < 1) return res.status(400).json({ error: 'Read the ad first.' })
      const { resume } = await memberResume(member, b.resume, b.resume_id)
      if (resume.length < 80) return res.status(400).json({ error: 'Add your resume first. The questions are built from it.', code: 'no_resume' })
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The writer isn’t switched on yet.', code: 'coach_off' })
      if (!rateLimit(req, res, { max: 30, windowMs: 60 * 60 * 1000, key: `np-cover-${member.id}` })) return
      try {
        const out = await askJson({ system: ANALYSE_SYSTEM, prompt: gapsPrompt(themes, clipText(resume, 12000)), schema: GAPS_SCHEMA, maxTokens: 2500 })
        return res.json({ themes: cleanGaps(out, themes) })
      } catch (err) {
        console.error('Resume gap check failed:', err)
        return res.status(502).json({ error: 'We couldn’t check your resume against the ad. Please try again in a minute.' })
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
      const state = sessionState(member.sessions_included, (await load(member)).bookings)
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

    // ── Sky's memory: what it knows, who can see it, and the member's controls ──
    case 'context_get':
      return res.json(await contextOf(member, coachOf(b.coach)))

    case 'privacy_set': {
      const level = cleanPrivacy(b.level)
      if (!level) return res.status(400).json({ error: 'Choose one of the three options.' })
      await supabase.from('newpage_members').update({ privacy: level }).eq('id', member.id)
      return res.json(await contextOf({ ...member, privacy: level }, coachOf(b.coach)))
    }
    case 'learn_set':
      await supabase.from('newpage_members').update({ learn: !!b.on }).eq('id', member.id)
      return res.json(await contextOf({ ...member, learn: !!b.on }, coachOf(b.coach)))

    case 'about_save': {
      if (!cryptoReady()) return res.status(503).json({ error: 'Private storage isn’t set up yet, so this can’t be saved. Please try again later.' })
      await setTool(member, 'about', cleanAbout(b.about))
      return res.json(await contextOf(member, coachOf(b.coach)))
    }
    case 'resume_delete':
      await supabase.from('newpage_tools').delete().eq('member_id', member.id).eq('tool', 'profile')
      return res.json(await contextOf(member, coachOf(b.coach)))

    case 'memory_add': {
      if (!cryptoReady()) return res.status(503).json({ error: 'Private storage isn’t set up yet, so this can’t be saved. Please try again later.' })
      const note = cleanNote(b.note)
      if (!note) return res.status(400).json({ error: 'Write the note first.' })
      const { memory } = await load(member)
      if (isDuplicateNote(note, memory.map(m => m.note))) return res.status(400).json({ error: 'Sky already has that.' })
      if (memory.length >= MEMORY_LIMIT) return res.status(400).json({ error: `Sky keeps up to ${MEMORY_LIMIT} notes. Delete one to make room.` })
      const v = await writeVault(member)
      await supabase.from('newpage_memory').insert({ member_id: member.id, note: sealText(v, 'mem', note) })
      return res.json(await contextOf(member, coachOf(b.coach)))
    }
    case 'memory_edit': {
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown note.' })
      const note = cleanNote(b.note)
      if (!note) return res.status(400).json({ error: 'A note can’t be empty. Delete it instead.' })
      const v = await writeVault(member)
      await supabase.from('newpage_memory').update({ note: sealText(v, 'mem', note) }).eq('id', b.id).eq('member_id', member.id)
      return res.json(await contextOf(member, coachOf(b.coach)))
    }
    case 'memory_delete': {
      if (b.all) await supabase.from('newpage_memory').delete().eq('member_id', member.id)
      else if (ID_RE.test(String(b.id))) await supabase.from('newpage_memory').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json(await me(member, coachOf(b.coach)))
    }

    // "Share with Vik": a copy of a chat, or of the member's context, that Vik can read.
    case 'share_chat':
    case 'share_context': {
      if (!['share', 'all'].includes(member.privacy)) return res.status(400).json({ error: 'First choose “Only what I share” in Your context, so you stay in control of what Vik sees.' })
      const v = await writeVault(member)
      if (!v) return res.status(503).json({ error: 'Private storage isn’t set up yet, so nothing can be shared. Please try again later.' })
      const note = clip(b.note, 300)
      let kind, content
      if (b.action === 'share_chat') {
        const coach = coachOf(b.coach)
        const { messages } = await load(member, coach)
        if (!messages.length) return res.status(400).json({ error: 'There’s no chat to share yet.' })
        kind = 'chat'
        content = { coach, note, messages: messages.slice(-CHAT_SHARE_LIMIT).map(m => ({ role: m.role, content: m.content, at: m.created_at })) }
      } else {
        const [about, profile] = await Promise.all([getTool(member, 'about'), getTool(member, 'profile')])
        const { memory } = await load(member)
        kind = 'context'
        content = { note, about: cleanAbout(about), resume: clipText(profile?.text, 12000), notes: memory.map(m => m.note) }
      }
      await supabase.from('newpage_shares').insert({ member_id: member.id, kind, content: v.text('share', JSON.stringify(content)) })
      return res.json(await contextOf(member, coachOf(b.coach)))
    }
    case 'share_delete':
      if (!ID_RE.test(String(b.id))) return res.status(400).json({ error: 'Unknown share.' })
      await supabase.from('newpage_shares').delete().eq('id', b.id).eq('member_id', member.id)
      return res.json(await contextOf(member, coachOf(b.coach)))

    // Everything Sky holds about them, as a file; and erasing it.
    case 'data_export':
      return res.json({ export: await exportMemory(member) })
    case 'data_delete': {
      if (b.confirm !== true) return res.status(400).json({ error: 'Please confirm.' })
      await eraseMemory(member.id, { state: 'active' })
      return res.json(await contextOf({ ...member, data_key: null, _vault: null }, coachOf(b.coach)))
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
      let vault
      try { vault = await writeVault(member) } catch (err) { return res.status(err.status || 500).json({ error: err.message }) }
      const store = rows => supabase.from('newpage_messages').insert(rows.map(r => ({ member_id: member.id, coach, role: r.role, content: sealText(vault, 'msg', r.content) })))

      // Safety first: this runs on every message, whatever the model would say.
      if (detectCrisis(text)) {
        await store([{ role: 'user', content: text }, { role: 'assistant', content: CRISIS_REPLY }])
        return res.json({ ...(await me(member, coach)), crisis: true })
      }
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'The coach isn’t switched on yet. Everything else in New Page works.', code: 'coach_off' })

      const data = await load(member, coach)
      const [cp, aboutRaw, profile, recent] = await Promise.all([getTool(member, 'compass'), getTool(member, 'about'), getTool(member, 'profile'),
        supabase.from('newpage_docs').select('kind, content').eq('member_id', member.id).eq('kind', 'resume').order('created_at', { ascending: false }).limit(5)])
      // Sky keeps its own notes as it learns, unless the member has switched that off.
      const learn = member.learn !== false && !!vault
      // Sky's private self-checks: the most recent steer for this focus shapes the next replies.
      const steerAll = (await getTool(member, 'steer')) || {}
      const current = steerAll[coach] && Date.now() - new Date(steerAll[coach].at).getTime() < 3 * 24 * 60 * 60 * 1000 ? steerAll[coach] : null
      const system = coachSystem({
        member, tasks: data.tasks, memory: data.memory, compass: cp ? cleanCompass(cp) : null, coach,
        about: cleanAbout(aboutRaw), resume: [clipText(profile?.text, 2600), tailorNote(recent.data)].filter(Boolean).join('\n\n'), learn, privacy: member.privacy || null, steer: current?.steer || []
      })
      const tools = {
        run: async (name, input) => {
          if (name === 'save_memory') {
            const note = cleanNote(input.note)
            if (!note || !learn) return 'Noted.'
            if (isDuplicateNote(note, data.memory.map(m => m.note))) return 'Already known.'
            if (data.memory.length >= MEMORY_LIMIT) {
              const oldest = data.memory.shift()
              if (oldest) await supabase.from('newpage_memory').delete().eq('id', oldest.id).eq('member_id', member.id)
            }
            await supabase.from('newpage_memory').insert({ member_id: member.id, note: sealText(vault, 'mem', note) })
            data.memory.push({ note })
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
        reply = await runCoach({ system, messages: toApiMessages(data.messages, text), tools, learn })
      } catch (err) {
        console.error('Coach failed:', err)
        return res.status(502).json({ error: err.status ? aiMessage(err) : 'Sky couldn’t answer just now. Please try again in a minute.' })
      }
      await store([{ role: 'user', content: text }, { role: 'assistant', content: reply.text }])

      // Every 5th member message: check against the week's objective and the member's own aims.
      // Every 10th: check against Purposefields' principles. Private; the result steers later replies.
      const nUser = data.messages.filter(m => m.role === 'user').length + 1
      const kind = checkDue(nUser)
      let check = null
      if (kind) {
        try {
          const Q = member.quadrant ? PROGRAM[member.quadrant] : null
          const week = Q ? Q[Math.min(3, Math.max(0, programPosition(member.plan_started_at).week - 1))] : null
          const about = cleanAbout(aboutRaw)
          const aims = [
            cp?.values?.length ? `Values: ${cleanCompass(cp).values.join(', ')}` : '',
            cp?.north ? `North Star: ${cleanCompass(cp).north}` : '',
            cp?.first ? `Direction they chose: ${cleanCompass(cp).first}` : '',
            about.goals ? `A good year: ${about.goals}` : '', about.coachStyle ? `Wants coaching: ${about.coachStyle}` : '', about.limits ? `Limits: ${about.limits}` : '',
            data.goals?.length ? `Goals: ${data.goals.map(g => g.title).join('; ')}` : '',
            data.memory.length ? `Notes: ${data.memory.slice(-15).map(m => m.note).join(' | ')}` : ''
          ].filter(Boolean).join('\n')
          const recent = [...data.messages.slice(-(kind === 'principles' ? 20 : 10)), { role: 'user', content: text }, { role: 'assistant', content: reply.text }]
          check = cleanCheck(await askJson({ system: 'You are a careful, fair reviewer of coaching conversations. Answer in the exact shape asked.', prompt: checkPrompt({ kind, recent, week, memberAims: aims, focus: COACH_NAME(coach) }), schema: CHECK_SCHEMA, maxTokens: 600 }))
          const next = { ...steerAll, [coach]: { at: new Date().toISOString(), kind, n: nUser, on_track: check.on_track, summary: check.summary, steer: check.steer } }
          await setTool(member, 'steer', next)
        } catch (err) { console.error('Sky self-check failed (reply was still sent):', err.message) }
      }
      return res.json({ ...(await me(member, coach)), usedTools: reply.used.map(u => u.name), ...(check ? { selfCheck: { kind, onTrack: check.on_track } } : {}) })
    }

    default:
      return res.status(400).json({ error: 'Unknown action' })
  }
}
