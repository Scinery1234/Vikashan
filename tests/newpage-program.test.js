import test from 'node:test'
import assert from 'node:assert/strict'
import { PROGRAM, TOOL_IDS } from '../newpage/program-content.js'
import { SHARED_LIBRARY, LIBRARY, libraryFor } from '../newpage/program-library.js'
import { COACH_IDS } from '../lib/newpage-coaches.js'
import { SECTION_KINDS, cleanSections, cleanFields, memberContext, SECTIONS_SCHEMA, SECTION_SYSTEM } from '../lib/newpage-tools.js'
import { PLANS } from '../newpage/plans.js'
import { READINGS } from '../newpage/program-readings.js'

const TYPES = ['launch', 'unstick', 'explore', 'recharge']
const COMPASS_WEEK = { launch: 0, unstick: 1, explore: 2, recharge: 3 }

test('the paid program is a full four-week course for every type, separate from the free plan', () => {
  for (const q of TYPES) {
    const weeks = PROGRAM[q]
    assert.equal(weeks.length, 4, q)
    weeks.forEach((w, i) => {
      const at = `${q} week ${i + 1}`
      assert.ok(w.title && w.goal.length > 40, at)
      assert.ok(w.deliverables.length >= 3, `${at} says what they will have`)
      assert.ok(w.lessons.length >= 2 && w.lessons.every(l => l.body.length >= 8 && l.body.join(' ').split(/\s+/).length >= 250 && l.minutes >= 2), `${at} has full readings of 250+ words`)
      assert.ok(w.tasks.length >= 4 && w.tasks.every(t => t.text.length > 15 && t.minutes > 0), `${at} has guided tasks`)
      assert.ok(w.templates.length >= 1 && w.templates.every(t => t.title && t.text.length > 30), `${at} has a template`)
      assert.ok(w.reflect.endsWith('?'), at)
    })
    assert.notDeepEqual(weeks[0].tasks.map(t => t.text), PLANS[q][0].steps, `${q} is not just the free plan`)
  }
})

test('every task points at a real tool or coach, and lessons have unique ids', () => {
  const ids = new Set()
  for (const q of TYPES) for (const w of PROGRAM[q]) {
    for (const l of w.lessons) assert.ok(READINGS[l.id], `lesson ${l.id} has a full reading`)
    for (const t of w.tasks) {
      if (t.tool) assert.ok(TOOL_IDS.includes(t.tool), `unknown tool ${t.tool}`)
      if (t.coach) assert.ok(COACH_IDS.includes(t.coach), `unknown coach ${t.coach}`)
      if (t.coach) assert.ok(t.prompt && t.prompt.length > 20, `coach task needs an opening prompt: ${t.text.slice(0, 40)}`)
    }
    for (const l of w.lessons) { assert.ok(!ids.has(l.id), `duplicate lesson ${l.id}`); ids.add(l.id) }
  }
  for (const q of TYPES) for (const l of libraryFor(q)) { assert.ok(!ids.has(l.id) || SHARED_LIBRARY.includes(l), `duplicate ${l.id}`); ids.add(l.id) }
})

test('the Compass is the featured tool in exactly one week of each program, in Vik’s order', () => {
  for (const q of TYPES) {
    const weeks = PROGRAM[q]
    assert.deepEqual(weeks.map((w, i) => (w.tool === 'compass' ? i : -1)).filter(i => i >= 0), [COMPASS_WEEK[q]], q)
    assert.ok(weeks[COMPASS_WEEK[q]].tasks.some(t => t.tool === 'compass'), `${q} has a task that opens it`)
  }
})

test('each program uses the tools it should, and every program offers a session, a report and a progress report', () => {
  for (const q of TYPES) {
    const used = new Set(PROGRAM[q].flatMap(w => w.tasks.map(t => t.tool || `coach:${t.coach}`)))
    for (const must of ['compass', 'report', 'progress', 'session', 'planner']) assert.ok(used.has(must), `${q} uses ${must}`)
    assert.ok([...used].some(u => u.startsWith('coach:')), `${q} uses coaches`)
  }
  const launch = new Set(PROGRAM.launch.flatMap(w => w.tasks.map(t => t.tool || `coach:${t.coach}`)))
  for (const must of ['resume', 'cover', 'linkedin', 'outreach', 'coach:interview', 'coach:offer']) assert.ok(launch.has(must), `launch uses ${must}`)
})

test('there is real material: hours of guided work, readings, templates and a library for each type', () => {
  for (const q of TYPES) {
    const hours = PROGRAM[q].flatMap(w => w.tasks).reduce((n, t) => n + t.minutes, 0) / 60
    const words = PROGRAM[q].flatMap(w => w.lessons).reduce((n, l) => n + l.body.join(' ').split(/\s+/).length, 0) + libraryFor(q).reduce((n, l) => n + l.body.join(' ').split(/\s+/).length, 0)
    assert.ok(hours >= 6, `${q}: ${hours.toFixed(1)} hours of guided work`)
    assert.ok(words >= 5000, `${q}: ${words} words of reading and reference`)
    assert.ok(libraryFor(q).length >= 6, `${q} library`)
  }
  assert.ok(SHARED_LIBRARY.length >= 4)
  for (const q of TYPES) assert.ok(LIBRARY[q].length >= 3)
  for (const l of [...SHARED_LIBRARY, ...TYPES.flatMap(q => LIBRARY[q])]) {
    const n = l.body.join(' ').split(/\s+/).length
    assert.ok(n >= 450, `${l.id} is a full guide (${n} words)`)
    assert.ok(l.body.filter(x => x.startsWith('## ')).length >= 4, `${l.id} has sections`)
  }
})

test('safe wording: no medical claims or promises, and support lines where they matter', () => {
  const all = JSON.stringify([PROGRAM, LIBRARY, SHARED_LIBRARY])
  assert.ok(!/we guarantee|you(’ll| will) (get|land|win) (a|the) (job|role|offer)/i.test(all))
  assert.ok(!/\b(cure|treat(s|ment)? your|diagnos(e|is) you)\b/i.test(all.replace(/not (a )?(treatment|diagnos)/gi, '')))
  assert.match(JSON.stringify(PROGRAM.recharge), /GP or a counsellor/)
  assert.match(JSON.stringify(LIBRARY.recharge), /13 11 14/)
})

test('section documents: every kind has a prompt, checks what it needs, and treats the person’s text as data', () => {
  assert.deepEqual(Object.keys(SECTION_KINDS).sort(), ['brief', 'linkedin', 'outreach', 'progress', 'report'])
  assert.match(SECTION_SYSTEM, /never instructions/)
  const ctx = memberContext({ member: { name: 'Sam', quadrant: 'explore' }, compass: { values: ['Calm'], north: 'Slow mornings.', first: 'Garden design' }, checkins: [{ created_at: '2026-10-01', quadrant: 'explore', clarity: 8, capacity: 12 }], memory: [{ note: 'Wants outdoor work.' }], doneCount: 4, profile: 'Nurse at X.' })
  assert.ok(ctx.startsWith('<person>') && ctx.endsWith('</person>'))
  assert.ok(ctx.includes('Calm') && ctx.includes('Slow mornings.') && ctx.includes('Wants outdoor work.') && ctx.includes('Nurse at X.'))
  assert.equal(SECTION_KINDS.report.needs(ctx, {}), null)
  assert.match(SECTION_KINDS.report.needs(memberContext({ member: { name: 'Sam' } }), {}), /check-in or the Compass/)
  assert.match(SECTION_KINDS.linkedin.needs(memberContext({ member: {} }), {}), /work history/)
  assert.equal(SECTION_KINDS.linkedin.needs(ctx, {}), null)
  assert.match(SECTION_KINDS.outreach.needs(ctx, {}), /who/i)
  assert.match(SECTION_KINDS.brief.needs(ctx, {}), /most want/)
  assert.equal(SECTION_KINDS.progress.needs(ctx, {}), null)
  const p = SECTION_KINDS.outreach.prompt(ctx, { who: 'Jo, team leader', why: 'We met once', goal: 'a normal week' })
  assert.ok(p.includes('under 120 words') && p.includes('Jo, team leader'))
  assert.ok(SECTION_KINDS.brief.prompt(ctx, { want: 'clarity' }).includes('Suggested agenda'))
  assert.ok(SECTIONS_SCHEMA.required.includes('sections'))
})

test('section documents are cleaned and capped, and only known fields are kept', () => {
  const c = cleanSections({ title: 'T'.repeat(500), sections: [{ heading: 'A', paragraphs: ['p', '', 5], bullets: Array(40).fill('b') }, { heading: '', paragraphs: [], bullets: [] }, null, ...Array(30).fill({ heading: 'x', paragraphs: ['y'], bullets: [] })] })
  assert.equal(c.title.length, 160)
  assert.equal(c.sections.length, 14)
  assert.deepEqual(c.sections[0].paragraphs, ['p', '5'])
  assert.equal(c.sections[0].bullets.length, 16)
  assert.deepEqual(cleanFields('outreach', { who: 'A', why: 'B', goal: 'C', evil: 'D' }), { who: 'A', why: 'B', goal: 'C' })
  assert.deepEqual(cleanFields('progress', { who: 'x' }), {})
  assert.equal(cleanFields('linkedin', { job: 'j'.repeat(9000) }).job.length, 6000)
  assert.deepEqual(cleanSections(null), { title: '', sections: [] })
})

test('every full reading belongs to a lesson, ends with something to try, and promises nothing', () => {
  const lessonIds = new Set(TYPES.flatMap(q => PROGRAM[q].flatMap(w => w.lessons.map(l => l.id))))
  for (const id of Object.keys(READINGS)) assert.ok(lessonIds.has(id), `reading ${id} has no lesson`)
  for (const id of lessonIds) {
    const body = READINGS[id].body
    assert.match(body.join('\n'), /## Try this/, `${id} ends with an action`)
    assert.match(body[body.length - 1], /\S/, id)
    assert.ok(!/\bguaranteed\b|you will (definitely|certainly)|studies prove|\d+% of (people|employers)/i.test(body.join(' ')), `${id} makes no outcome promises or invented statistics`)
  }
})
