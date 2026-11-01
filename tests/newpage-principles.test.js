import test from 'node:test'
import assert from 'node:assert/strict'
import { PRINCIPLES, CHECK_EVERY, checkDue, checkPrompt, cleanCheck, steerText } from '../lib/newpage-principles.js'
import { coachSystem } from '../lib/newpage-coach.js'
import { listItems, applyRows, resetContentForTests } from '../lib/newpage-content.js'

const member = { name: 'Jo', quadrant: 'launch', plan_started_at: new Date().toISOString() }

test('Purposefields principles are in Sky’s instructions on every message', () => {
  for (const coach of ['career', 'recovery', 'interview']) {
    const sys = coachSystem({ member, tasks: [], memory: [], coach })
    assert.ok(sys.includes(PRINCIPLES.summary), coach)
    assert.ok(/strengths-based and person-centred/i.test(sys) && /free or low-cost routes first/.test(sys) && /Never promise outcomes/.test(sys), coach)
    assert.ok(/Name a strength you notice/.test(sys), 'strengths get named')
  }
  assert.equal(PRINCIPLES.values.length, 7)
  assert.ok(PRINCIPLES.values.some(v => /Strengths-based/.test(v.name)) && PRINCIPLES.values.some(v => /Decolonised/.test(v.name)) && PRINCIPLES.values.some(v => /Access for everybody/.test(v.name)))
})

test('checks fall on every 5th message (objective) and every 10th (principles)', () => {
  assert.deepEqual(CHECK_EVERY, { objective: 5, principles: 10 })
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 10, 15, 20, 25].map(checkDue), [null, null, null, null, 'objective', null, null, 'principles', 'objective', 'principles', 'objective'])
})

test('the objective check carries the week, the member’s own aims and the recent chat; the principles check carries the principles', () => {
  const week = { title: 'Confirm your direction', goal: 'Make sure the role fits your life.', deliverables: ['A target role'] }
  const recent = [{ role: 'user', content: 'I want a policy job but my mum needs care three days a week' }, { role: 'assistant', content: 'Have you thought about relocating to Canberra?' }]
  const p = checkPrompt({ kind: 'objective', recent, week, memberAims: 'Values: Family, Care', focus: 'Career' })
  assert.ok(p.includes('Confirm your direction') && p.includes('Values: Family, Care') && p.includes('relocating to Canberra') && /serving this week's objective AND the member's own values/.test(p))
  const q = checkPrompt({ kind: 'principles', recent, week, memberAims: '', focus: 'Career' })
  assert.ok(q.includes(PRINCIPLES.intro) && PRINCIPLES.values.every(v => q.includes(v.name)) && /deficit language/.test(q))
  const none = checkPrompt({ kind: 'objective', recent, week: null, memberAims: '', focus: 'Career' })
  assert.ok(/has not chosen a plan yet/.test(none))
})

test('a check result is cleaned and becomes a private steer in Sky’s instructions', () => {
  const c = cleanCheck({ on_track: false, summary: 'Drifted into relocation advice.', steer: ['They said family comes first; stop suggesting relocation.', '', 'x'.repeat(500), 'Bring it back to the two roles they named.', 'four'] })
  assert.equal(c.on_track, false); assert.equal(c.steer.length, 3); assert.equal(c.steer[1].length, 200)
  assert.deepEqual(cleanCheck(null), { on_track: true, summary: '', steer: [] })
  const sys = coachSystem({ member, tasks: [], memory: [], coach: 'career', steer: c.steer })
  assert.ok(sys.includes('stop suggesting relocation') && /private, do not mention it to the member/.test(sys))
  assert.equal(steerText([]), '')
  assert.ok(!coachSystem({ member, tasks: [], memory: [], coach: 'career' }).includes('self-check'))
})

test('the principles can be edited from the content editor and Sky uses the new words', () => {
  resetContentForTests()
  const items = listItems()
  assert.ok(items.some(i => i.key === 'sky/principles') && items.filter(i => i.key.startsWith('sky/value/')).length === 7)
  applyRows([{ key: 'sky/principles', value: { summary: 'EDITED SUMMARY for Sky.' } }, { key: 'sky/value/0', value: { name: 'Edited first principle' } }])
  assert.ok(coachSystem({ member, tasks: [], memory: [], coach: 'career' }).includes('EDITED SUMMARY for Sky.'))
  assert.ok(checkPrompt({ kind: 'principles', recent: [], week: null, memberAims: '', focus: 'Career' }).includes('Edited first principle'))
  resetContentForTests()
  assert.ok(!coachSystem({ member, tasks: [], memory: [], coach: 'career' }).includes('EDITED SUMMARY'))
})
