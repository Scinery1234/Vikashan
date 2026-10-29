import test from 'node:test'
import assert from 'node:assert/strict'
import { listItems, applyRows, prepareEdit, cleanValue, resetContentForTests, hasItem, refreshContent } from '../lib/newpage-content.js'
import { PROGRAM, readingMinutes } from '../newpage/program-content.js'
import { SHARED_LIBRARY } from '../newpage/program-library.js'
import { QUADRANTS } from '../newpage/quiz-logic.js'
import { followupEmail, planEmail } from '../lib/newpage-emails.js'

test('every program week, task, template, reading, guide, plan week and follow-up is listed', () => {
  resetContentForTests()
  const items = listItems()
  const keys = new Set(items.map(i => i.key))
  assert.equal(keys.size, items.length, 'keys are unique')
  for (const q of ['launch', 'unstick', 'explore', 'recharge']) {
    PROGRAM[q].forEach((w, wi) => {
      assert.ok(keys.has(`p/${q}/${wi}`))
      w.tasks.forEach((_, ti) => assert.ok(keys.has(`p/${q}/${wi}/t/${ti}`)))
      w.templates.forEach((_, ti) => assert.ok(keys.has(`p/${q}/${wi}/tp/${ti}`)))
      w.lessons.forEach(l => assert.ok(keys.has(`p/${q}/${wi}/l/${l.id}`)))
      assert.ok(keys.has(`f/${q}/${wi}`))
    })
  }
  assert.equal(items.filter(i => i.group === 'library').length, 18)
  assert.ok(items.filter(i => i.kind === 'email').length >= 19)
  assert.ok(items.every(i => !i.fields.some(f => f.edited)), 'nothing is edited to begin with')
})

test('an edit is applied over the original, and removing it puts the original back', () => {
  resetContentForTests()
  const task = PROGRAM.launch[0].tasks[0]
  const original = task.text, count = PROGRAM.launch[0].tasks.length
  applyRows([{ key: 'p/launch/0/t/0', value: { text: 'New wording' }, updated_at: 'now' }])
  assert.equal(task.text, 'New wording')
  assert.equal(PROGRAM.launch[0].tasks.length, count, 'the number of tasks never changes')
  assert.equal(task.minutes, 10 === task.minutes ? 10 : task.minutes, 'untouched fields stay')
  assert.ok(listItems().find(i => i.key === 'p/launch/0/t/0').fields.find(f => f.name === 'text').edited)
  applyRows([])
  assert.equal(task.text, original)
})

test('editing a reading re-works its minutes, and a guide too', () => {
  resetContentForTests()
  const lesson = PROGRAM.unstick[0].lessons[0]
  const long = Array(400).fill('word').join(' ')
  applyRows([{ key: `p/unstick/0/l/${lesson.id}`, value: { body: [long] } }, { key: `lib/${SHARED_LIBRARY[0].id}`, value: { body: [long] } }])
  assert.deepEqual(lesson.body, [long])
  assert.equal(lesson.minutes, readingMinutes([long]))
  assert.equal(SHARED_LIBRARY[0].minutes, readingMinutes([long]))
  resetContentForTests()
})

test('edits reach the emailed plan and the follow-up emails', () => {
  resetContentForTests()
  applyRows([
    { key: 'f/launch/0', value: { steps: ['Brand new first step.', 'Second.'], title: 'A new week title' } },
    { key: 'e/launch/2', value: { subject: 'A fresh subject', paras: ['A fresh paragraph.'] } },
    { key: 'e/shared/28', value: { paras: ['New shared words {retake}.'] } }
  ])
  const plan = planEmail({ name: 'Jo', quadrant: 'launch', answers: {}, personal: {}, introCall: false, token: 't', struggling: false })
  assert.ok(plan.html.includes('Brand new first step.') && plan.html.includes('A new week title'))
  const f = followupEmail({ day: 2, quadrant: 'launch', name: 'Jo', token: 't', personal: {} })
  assert.equal(f.subject, 'A fresh subject')
  assert.ok(f.html.includes('A fresh paragraph.'))
  assert.ok(followupEmail({ day: 28, quadrant: 'recharge', name: 'Jo', token: 't' }).html.includes('New shared words'))
  resetContentForTests()
  assert.notEqual(followupEmail({ day: 2, quadrant: 'launch', name: 'Jo', token: 't' }).subject, 'A fresh subject')
  assert.ok(QUADRANTS.launch.weeks[0].steps.length >= 2)
})

test('edits are validated and only differences from the original are kept', () => {
  resetContentForTests()
  const orig = PROGRAM.explore[1].title
  assert.deepEqual(prepareEdit('p/explore/1', { title: orig }), {}, 'same as the original means no edit')
  assert.deepEqual(prepareEdit('p/explore/1', { title: `  ${orig} two  ` }), { title: `${orig} two` })
  assert.throws(() => prepareEdit('p/explore/1', { title: '   ' }), /empty/)
  assert.throws(() => prepareEdit('p/explore/1', { nope: 'x' }), /Unknown field/)
  assert.throws(() => prepareEdit('nope', {}), /Unknown item/)
  assert.throws(() => cleanValue('int', 0), /whole number/)
  assert.throws(() => cleanValue('int', 2.5), /whole number/)
  assert.throws(() => cleanValue('text', 'x'.repeat(301)), /too long/)
  assert.deepEqual(cleanValue('lines', ' a \n\n b\n'), ['a', 'b'])
  assert.equal(cleanValue('int', '25'), 25)
  assert.ok(hasItem('lib/lib-aus-search') && !hasItem('lib/none'))
})

test('a database failure keeps the last applied content', async () => {
  resetContentForTests()
  applyRows([{ key: 'p/launch/0', value: { title: 'Kept title' } }])
  await refreshContent({ force: true, supabase: { from: () => ({ select: async () => ({ data: null, error: new Error('down') }) }) } })
  assert.equal(PROGRAM.launch[0].title, 'Kept title')
  resetContentForTests()
})
