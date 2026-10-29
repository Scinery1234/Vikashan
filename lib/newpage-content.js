// Editable New Page content. The program text (weeks, tasks, lessons,
// templates), the resource library and the emailed free plans live in code as
// the "original". Vik edits them from /newpage/admin/content; each edit is
// saved in the newpage_content table and applied on top of the original, so
// anyone who opens the program or is sent a plan from then on gets the new
// text. "Reset to original" deletes the edit.
//
// Only text can be edited. The number of tasks, lessons and templates is fixed
// so that members' ticked-off progress always lines up.
import { PROGRAM, readingMinutes } from '../newpage/program-content.js'
import { SHARED_LIBRARY, LIBRARY } from '../newpage/program-library.js'
import { QUADRANTS } from '../newpage/quiz-logic.js'
import { BY_QUADRANT, SHARED } from './newpage-emails.js'

const QS = ['launch', 'unstick', 'explore', 'recharge']
const TTL = 30 * 1000

export const FIELD_LIMITS = { text: 300, long: 20000, lines: 400, int: 240 }

let items = null     // key -> item
let rows = {}        // key -> { value, updated_at } from the database
let loadedAt = 0

const clone = v => JSON.parse(JSON.stringify(v ?? null))
const field = (type, label, get, set, extra = {}) => ({ type, label, get, set, base: clone(get()), ...extra })

function build() {
  const out = new Map()
  const add = (key, meta, fields) => out.set(key, { key, ...meta, fields })

  for (const q of QS) {
    const qn = QUADRANTS[q].name
    PROGRAM[q].forEach((w, wi) => {
      const wk = { group: 'program', q, week: wi }
      add(`p/${q}/${wi}`, { ...wk, kind: 'week', label: `Week ${wi + 1} overview`, where: `${qn}, week ${wi + 1}` }, {
        title: field('text', 'Week title', () => w.title, v => { w.title = v }),
        goal: field('long', 'What this week is for', () => w.goal, v => { w.goal = v }),
        deliverables: field('lines', 'By the end of the week they will have (one per line)', () => w.deliverables, v => { w.deliverables = v }),
        reflect: field('long', 'End-of-week reflection question', () => w.reflect, v => { w.reflect = v })
      })
      w.tasks.forEach((t, ti) => {
        const f = {
          text: field('long', 'Task', () => t.text, v => { t.text = v }),
          minutes: field('int', 'Minutes it should take', () => t.minutes, v => { t.minutes = v })
        }
        if (t.prompt) f.prompt = field('long', 'First message sent to Sky when they tap “Talk to Sky”', () => t.prompt, v => { t.prompt = v })
        add(`p/${q}/${wi}/t/${ti}`, { ...wk, kind: 'task', label: `Task ${ti + 1}`, where: `${qn}, week ${wi + 1}` }, f)
      })
      w.templates.forEach((t, ti) => add(`p/${q}/${wi}/tp/${ti}`, { ...wk, kind: 'template', label: `Template: ${t.title}`, where: `${qn}, week ${wi + 1}` }, {
        title: field('text', 'Template name', () => t.title, v => { t.title = v }),
        text: field('long', 'Template text', () => t.text, v => { t.text = v })
      }))
      w.lessons.forEach(l => add(`p/${q}/${wi}/l/${l.id}`, { ...wk, kind: 'lesson', label: `Reading: ${l.title}`, where: `${qn}, week ${wi + 1}` }, {
        title: field('text', 'Reading title', () => l.title, v => { l.title = v }),
        body: field('lines', 'Reading (one paragraph per line; start a line with ## for a heading and - for a bullet)', () => l.body, v => { l.body = v; l.minutes = readingMinutes(v) })
      }))
    })
  }

  const lib = (g, q, l) => add(`lib/${l.id}`, { group: 'library', q, kind: 'library', label: l.title, where: q === 'shared' ? 'Everyone' : `${QUADRANTS[q].name} only` }, {
    title: field('text', 'Guide title', () => l.title, v => { l.title = v }),
    summary: field('long', 'One-line summary', () => l.summary, v => { l.summary = v }),
    body: field('lines', 'Guide (one paragraph per line; start a line with ## for a heading and - for a bullet)', () => l.body, v => { l.body = v; l.minutes = readingMinutes(v) })
  })
  SHARED_LIBRARY.forEach(l => lib('library', 'shared', l))
  for (const q of QS) (LIBRARY[q] || []).forEach(l => lib('library', q, l))

  for (const q of QS) {
    QUADRANTS[q].weeks.forEach((w, wi) => add(`f/${q}/${wi}`, { group: 'plan', q, week: wi, kind: 'plan', label: `Week ${wi + 1}`, where: `${QUADRANTS[q].name}, emailed plan` }, {
      title: field('text', 'Week title', () => w.title, v => { w.title = v }),
      why: field('long', 'Why this week', () => w.why, v => { w.why = v }),
      steps: field('lines', 'Steps (one per line)', () => w.steps, v => { w.steps = v }),
      withNewPage: field('long', 'Optional note about New Page', () => w.withNewPage, v => { w.withNewPage = v })
    }))
  }

  // Follow-up emails after the plan: [subject, paragraphs]. {retake}, {call}, {scholarship} and {stay} become links.
  const mail = (q, day, entry) => add(`e/${q}/${day}`, { group: 'plan', q, week: null, kind: 'email', day: Number(day), label: `Day ${day} email`, where: q === 'shared' ? 'Sent to every type' : `${QUADRANTS[q].name}, follow-up email` }, {
    subject: field('text', 'Subject line', () => entry[0], v => { entry[0] = v }),
    paras: field('lines', 'Email text (one paragraph per line; {retake}, {call}, {scholarship} and {stay} become links)', () => entry[1], v => { entry[1] = v })
  })
  for (const q of QS) for (const day of Object.keys(BY_QUADRANT[q])) mail(q, day, BY_QUADRANT[q][day])
  for (const day of Object.keys(SHARED)) mail('shared', day, SHARED[day])
  return out
}

const all = () => (items ||= build())

// Applies the saved edits over the original, field by field.
export function applyRows(list) {
  rows = {}
  for (const r of list || []) rows[r.key] = { value: r.value || {}, updated_at: r.updated_at }
  for (const it of all().values()) {
    const o = rows[it.key]?.value || {}
    for (const [name, f] of Object.entries(it.fields)) f.set(clone(name in o ? o[name] : f.base))
  }
}

// Reload from the database at most every 30 seconds. If the database can't be
// reached, whatever was applied last stays in place.
export async function refreshContent({ force = false, supabase } = {}) {
  if (!force && loadedAt && Date.now() - loadedAt < TTL) return
  try {
    const sb = supabase || (await import('./supabase.js')).supabase
    const { data, error } = await sb.from('newpage_content').select('key, value, updated_at')
    if (error) throw error
    applyRows(data)
    loadedAt = Date.now()
  } catch (err) {
    console.error('Content refresh failed, keeping what is loaded:', err?.message || err)
  }
}

export const resetContentForTests = () => { loadedAt = 0; applyRows([]) }

export function cleanValue(type, v) {
  if (type === 'int') {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1 || n > FIELD_LIMITS.int) throw new Error(`Enter a whole number from 1 to ${FIELD_LIMITS.int}.`)
    return n
  }
  if (type === 'lines') {
    const a = (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(x => String(x).trim()).filter(Boolean)
    if (a.length > FIELD_LIMITS.lines) throw new Error('That’s too many lines.')
    if (a.some(x => x.length > 6000)) throw new Error('One line is far too long. Split it into paragraphs.')
    return a
  }
  const s = String(v ?? '').trim()
  if (!s) throw new Error('This can’t be empty.')
  if (s.length > FIELD_LIMITS[type]) throw new Error('That’s too long.')
  return s
}

// What the editor shows: every item, with the live value, the original and
// whether it has been edited.
export function listItems() {
  return [...all().values()].map(it => ({
    key: it.key, group: it.group, q: it.q, week: it.week ?? null, day: it.day ?? null, kind: it.kind, label: it.label, where: it.where,
    updated_at: rows[it.key]?.updated_at || null,
    fields: Object.entries(it.fields).map(([name, f]) => {
      const cur = f.get()
      return { name, type: f.type, label: f.label, value: cur, base: f.base, edited: JSON.stringify(cur) !== JSON.stringify(f.base) }
    })
  }))
}

// Validates an edit and returns what to store: only the fields that differ
// from the original. An empty result means "back to the original".
export function prepareEdit(key, values) {
  const it = all().get(key)
  if (!it) throw new Error('Unknown item.')
  const keep = {}
  for (const [name, raw] of Object.entries(values || {})) {
    const f = it.fields[name]
    if (!f) throw new Error(`Unknown field: ${name}`)
    const v = cleanValue(f.type, raw)
    if (JSON.stringify(v) !== JSON.stringify(f.base)) keep[name] = v
  }
  return keep
}
export const hasItem = key => all().has(key)
