// Logic for the New Page member app, kept apart from the API handlers so it
// can be tested without a database.
import { QUADRANTS, STATEMENTS, FEELINGS, SITUATIONS, score, planTweaks } from '../newpage/quiz-logic.js'

const DAY = 24 * 60 * 60 * 1000
export const PROGRAM_WEEKS = 4

// Week 1 starts on the day the plan starts. After day 28 the program is
// "complete": the app keeps showing week 4 and says so.
export function programPosition(startedAt, now = Date.now()) {
  const start = new Date(startedAt).getTime()
  const days = Math.max(0, Math.floor((now - start) / DAY))
  const week = Math.min(PROGRAM_WEEKS, Math.floor(days / 7) + 1)
  return { day: days + 1, week, complete: days >= PROGRAM_WEEKS * 7, daysLeft: Math.max(0, PROGRAM_WEEKS * 7 - days) }
}

// Self-check-in: the eight statements are required; situation and feeling
// fall back to neutral values when the member hasn't been asked.
export function cleanCheckin(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const s of STATEMENTS) {
    const v = raw[s.key]
    if (!(Number.isInteger(v) && v >= 1 && v <= 4)) return null
    out[s.key] = v
  }
  out.sit = SITUATIONS.some(o => o.v === raw.sit) ? raw.sit : 'other'
  out.feel = Number.isInteger(raw.feel) && raw.feel >= 1 && raw.feel <= FEELINGS.length ? raw.feel : 3
  if (Number.isInteger(raw.sat) && raw.sat >= 1 && raw.sat <= 4) out.sat = raw.sat
  return out
}

const CRISIS = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die', 'dont want to live', 'do not want to live',
  'self-harm', 'self harm', 'hurt myself', 'cut myself', 'overdose', 'harm myself', 'not worth living', 'better off dead'
]

// Runs on every message the member sends, whatever the model would say.
export function detectCrisis(text) {
  const t = String(text || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/don't/g, 'dont')
  return CRISIS.some(k => t.includes(k))
}

export const CRISIS_REPLY = 'It sounds like things may be really hard right now. Please reach out to someone who can help today: Lifeline on 13 11 14 (24/7), Beyond Blue on 1300 22 4636, or 000 if you’re in immediate danger. Your career can wait. I’m here when you’re ready.'

export function planFor(member) {
  const Q = member.quadrant ? QUADRANTS[member.quadrant] : null
  if (!Q) return null
  const answers = member.answers || {}
  const result = answers.s1 ? score(answers) : { burnout: false }
  return {
    quadrant: member.quadrant, name: Q.name, tag: Q.tag, color: Q.color, tint: Q.tint, meaning: Q.meaning, week1: Q.week1,
    weeks: Q.weeks.map(w => ({ title: w.title, why: w.why, steps: w.steps })),
    tweaks: answers.s1 ? planTweaks(answers, member.personal || {}, result) : []
  }
}

// Everything the app screens need, in one payload.
export function buildMe({ member, progress, tasks, checkins, memory, messages, now = Date.now(), coachOn = false }) {
  const plan = planFor(member)
  const latest = checkins.length ? checkins[checkins.length - 1] : null
  const position = programPosition(member.plan_started_at, now)
  const done = new Set(progress.map(p => `${p.week}-${p.step}`))
  const stepsThisWeek = plan ? plan.weeks[position.week - 1].steps : []
  const doneThisWeek = stepsThisWeek.filter((_, i) => done.has(`${position.week}-${i}`)).length
  // Latest check-in, or their quiz result if they haven't checked in since.
  const from = latest || (member.answers?.s1 ? score(member.answers) : null)
  const pos = from ? { x: Math.round(((from.capacity - 4) / 12) * 100), y: Math.round(((from.clarity - 4) / 12) * 100) } : null
  return {
    member: { name: member.name || '', email: member.email, source: member.source, startedAt: member.plan_started_at, quadrant: member.quadrant, sessionBooked: !!member.session_booked },
    program: { ...position, doneThisWeek, totalThisWeek: stepsThisWeek.length, sessionWindow: position.week === 2 || position.week === 3 },
    plan,
    progress: [...done],
    tasks,
    checkins: checkins.map(c => ({ clarity: c.clarity, capacity: c.capacity, quadrant: c.quadrant, at: c.created_at })),
    position: pos,
    memory,
    messages,
    coachOn,
    sessionUrl: '/book'
  }
}
