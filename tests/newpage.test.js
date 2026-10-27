import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestions, validateAnswers, score, offersIntroCall, planTweaks, QUADRANTS } from '../newpage/quiz-logic.js'
import { planEmail, followupEmail, dueDay, weekOneICS, launchEmail, FOLLOWUP_DAYS } from '../lib/newpage-emails.js'

// Statements: clarity s1 s3 s5 s7, capacity s2 s4(reversed) s6 s8.
const answers = (c, p, extra = {}) => ({
  s1: c, s3: c, s5: c, s7: c,
  s2: p, s4: 5 - p, s6: p, s8: p,
  sit: 'between', feel: 1, ...extra
})

test('question list is 10, or 11 with the job-satisfaction question', () => {
  assert.equal(buildQuestions({}).length, 10)
  assert.equal(buildQuestions({ sit: 'between' }).length, 10)
  assert.equal(buildQuestions({ sit: 'employed' }).length, 11)
  assert.equal(buildQuestions({ sit: 'change' }).length, 11)
  assert.equal(buildQuestions({ sit: 'employed' })[9].key, 'sat')
  assert.equal(buildQuestions({}).at(-1).key, 'feel')
})

test('each quadrant comes from the two axes', () => {
  assert.equal(score(answers(1, 1)).quadrant, 'recharge')
  assert.equal(score(answers(1, 4)).quadrant, 'explore')
  assert.equal(score(answers(4, 1)).quadrant, 'unstick')
  assert.equal(score(answers(4, 4)).quadrant, 'launch')
})

test('statement 4 (burnout) is scored in reverse', () => {
  const a = answers(4, 4)
  assert.equal(score(a).capacity, 16)
  assert.equal(score({ ...a, s4: 4 }).capacity, 13)
  assert.equal(score({ ...a, s4: 4 }).burnout, true)
  assert.equal(score(a).burnout, false)
})

test('11 out of 16 is high, 10 is low', () => {
  const tenClarity = { ...answers(1, 4), s1: 3, s3: 3, s5: 2, s7: 2 }
  assert.equal(score(tenClarity).clarity, 10)
  assert.equal(score(tenClarity).quadrant, 'explore')
  const elevenClarity = { ...tenClarity, s7: 3 }
  assert.equal(score(elevenClarity).clarity, 11)
  assert.equal(score(elevenClarity).quadrant, 'launch')
})

test('wellbeing has five options; 4 is low, 5 is struggling', () => {
  assert.equal(buildQuestions({}).at(-1).opts.length, 5)
  assert.equal(score(answers(2, 2, { feel: 4 })).lowMood, true)
  assert.equal(score(answers(2, 2, { feel: 4 })).struggling, false)
  assert.equal(score(answers(2, 2, { feel: 5 })).struggling, true)
  assert.ok(validateAnswers(answers(2, 2, { feel: 5 })))
  assert.equal(validateAnswers(answers(2, 2, { feel: 6 })), null)
})

test('the dot spans 0 to 100', () => {
  assert.deepEqual([score(answers(1, 1)).x, score(answers(1, 1)).y], [0, 0])
  assert.deepEqual([score(answers(4, 4)).x, score(answers(4, 4)).y], [100, 100])
})

test('validation rejects missing or out-of-range answers', () => {
  assert.ok(validateAnswers(answers(2, 3)))
  assert.equal(validateAnswers({ ...answers(2, 3), s1: 5 }), null)
  assert.equal(validateAnswers({ ...answers(2, 3), sit: 'nope' }), null)
  assert.equal(validateAnswers(answers(2, 3, { sit: 'employed' })), null, 'sat required when employed')
  assert.ok(validateAnswers(answers(2, 3, { sit: 'employed', sat: 2 })))
  const extra = validateAnswers({ ...answers(2, 3), sneaky: 'x' })
  assert.equal(extra.sneaky, undefined)
})

test('intro call is offered to keen people, never after the safety screen', () => {
  const ok = score(answers(4, 4))
  assert.equal(offersIntroCall({ coach: 'yes' }, ok), true)
  assert.equal(offersIntroCall({ time: 'asap' }, ok), true)
  assert.equal(offersIntroCall({ coach: 'no', time: 'soon' }, ok), false)
  assert.equal(offersIntroCall({ coach: 'yes' }, score(answers(4, 4, { feel: 5 }))), false)
})

test('plan tweaks follow situation, satisfaction and blockers', () => {
  const unhappy = planTweaks(answers(2, 2, { sit: 'employed', sat: 1 }))
  assert.match(unhappy[0], /evenings and weekends/)
  const happy = planTweaks(answers(2, 2, { sit: 'employed', sat: 4 }))
  assert.match(happy[0], /growth where you are/)
  const burnt = planTweaks(answers(2, 2), { block: 'energy' })
  assert.ok(burnt.some(t => /burnt out/.test(t) && /rest first/.test(t)))
  assert.ok(!burnt.some(t => /Coach|Compass|planner/i.test(t)), 'free plan tweaks name no paid tools')
})

test('every quadrant has a full 4-week program', () => {
  for (const q of Object.values(QUADRANTS)) {
    assert.equal(q.weeks.length, 4)
    assert.ok(q.weeks.every(w => w.steps.length >= 2 && w.why && w.withNewPage))
  }
})

test('plan email includes all four weeks, escapes the name and attaches an invite', () => {
  const mail = planEmail({ name: '<b>Sam</b> Lee', quadrant: 'explore', answers: answers(1, 4), personal: {}, introCall: true, token: 'a'.repeat(32) })
  assert.equal(mail.subject, 'Your New Page plan: Explore')
  assert.ok(mail.html.includes('&lt;b&gt;Sam&lt;/b&gt;'))
  assert.ok(!mail.html.includes('<b>Sam</b>'))
  for (let w = 1; w <= 4; w++) assert.ok(mail.html.includes(`Week ${w}`))
  assert.ok(mail.html.includes('#book-call'))
  assert.match(mail.ics, /DTSTART;TZID=Australia\/Sydney:\d{8}T090000/)
})

test('week-one invite is for tomorrow in Sydney', () => {
  // 11pm UTC on 1 March is 10am on 2 March in Sydney, so "tomorrow" is 3 March.
  const ics = weekOneICS(QUADRANTS.launch, new Date('2027-03-01T23:00:00Z'))
  assert.match(ics, /DTSTART;TZID=Australia\/Sydney:20270303T090000/)
})

test('follow-up scheduling sends the latest due email only once', () => {
  assert.equal(dueDay(1, 0), null)
  assert.equal(dueDay(2, 0), 2)
  assert.equal(dueDay(3, 2), null)
  assert.equal(dueDay(9, 2), 7, 'a missed run skips to the latest email')
  assert.equal(dueDay(42, 35), 42)
  assert.equal(dueDay(50, 42), null)
})

test('every follow-up day has an email for every quadrant, except day 21 without a story', () => {
  for (const quadrant of Object.keys(QUADRANTS)) {
    for (const day of FOLLOWUP_DAYS) {
      const mail = followupEmail({ day, quadrant, name: 'Sam', token: 'b'.repeat(32) })
      if (day === 21) assert.equal(mail, null)
      else {
        assert.ok(mail?.subject, `${quadrant} day ${day}`)
        assert.ok(mail.html.includes('unsubscribe?t='))
        assert.ok(!/\{(retake|call|scholarship|stay)\}/.test(mail.html), 'placeholders replaced')
      }
    }
  }
})

test('day-2 follow-up adds a tip for their main blocker', () => {
  const withTip = followupEmail({ day: 2, quadrant: 'launch', name: 'Sam', token: 'b'.repeat(32), personal: { block: 'time' } })
  assert.match(withTip.html, /You said time is most in the way/)
  const without = followupEmail({ day: 2, quadrant: 'launch', name: 'Sam', token: 'b'.repeat(32) })
  assert.ok(!/most in the way/.test(without.html))
  const later = followupEmail({ day: 7, quadrant: 'launch', name: 'Sam', token: 'b'.repeat(32), personal: { block: 'time' } })
  assert.ok(!/most in the way/.test(later.html))
})

test('launch email links to checkout when given, else the program page, and escapes names', () => {
  const withCheckout = launchEmail({ name: '<i>Jo</i>', checkoutUrl: 'https://buy.stripe.com/abc', token: 'c'.repeat(32) })
  assert.equal(withCheckout.subject, 'New Page is open')
  assert.ok(withCheckout.html.includes('https://buy.stripe.com/abc'))
  assert.ok(withCheckout.html.includes('&lt;i&gt;Jo&lt;/i&gt;'))
  assert.ok(withCheckout.html.includes('unsubscribe?t='))
  assert.match(withCheckout.html, /7 days/)
  const noCheckout = launchEmail({ name: 'Jo' })
  assert.ok(noCheckout.html.includes('/newpage/program'))
})

test('free plan steps stand alone: only the optional note names New Page tools', () => {
  const tools = /(Recovery Coach|Action Coach|Executive Function Coach|Career Coach|Reducing the Charge|Clarity Compass|The Compass|Resume Generator|Cover Letter Generator|resume writer|cover letter writer|planner|MadeHappen)/i
  for (const q of Object.values(QUADRANTS)) {
    for (const w of q.weeks) {
      for (const step of w.steps) assert.ok(!tools.test(step), `${q.name} "${w.title}": ${step.slice(0, 60)}`)
      assert.match(w.withNewPage, tools, `${q.name} "${w.title}" optional note names a tool`)
    }
  }
})

test('plan email shows each week, its optional New Page note, and no sales P.S. for someone struggling', () => {
  const base = { name: 'Sam', quadrant: 'explore', answers: answers(1, 4), personal: {}, introCall: false, token: 'a'.repeat(32) }
  const normal = planEmail(base)
  assert.equal((normal.html.match(/Optional, with New Page:/g) || []).length, 4)
  assert.match(normal.html, /works on its own, with nothing to buy/)
  assert.match(normal.html, /that’s what New Page is for/)
  const struggling = planEmail({ ...base, struggling: true })
  assert.ok(!/that’s what New Page is for/.test(struggling.html))
  assert.ok(!/book a free 20-minute call/.test(struggling.html))
  assert.match(struggling.html, /Lifeline is there on 13 11 14/)
  assert.ok(!/They’re optional extras/.test(struggling.html))
  assert.ok(!/Optional, with New Page:/.test(struggling.html), 'no product notes for someone struggling')
})

test('the Compass features in every plan, in the week Vik chose: Launch 1, Unstick 2, Explore 3, Recharge 4', () => {
  const week = { launch: 0, unstick: 1, explore: 2, recharge: 3 }
  for (const [k, i] of Object.entries(week)) {
    const weeks = QUADRANTS[k].weeks
    const featured = weeks.map((w, n) => (w.tool === 'compass' ? n : -1)).filter(n => n >= 0)
    assert.deepEqual(featured, [i], `${k} features the Compass once, in week ${i + 1}`)
    assert.match(weeks[i].withNewPage, /The Compass/, `${k} week ${i + 1} note names it`)
    assert.ok(weeks.slice(0, i + 1).some(w => w.steps.some(s => /values/i.test(s) && /five/i.test(s))), `${k} writes down top values by its Compass week`)
    assert.ok(weeks[i].steps.some(s => /“I am/.test(s)), `${k} week ${i + 1} has a stand-alone “I am” step`)
    assert.ok(weeks[i].steps.some(s => /North Star/.test(s)), `${k} week ${i + 1} has a stand-alone North Star step`)
    weeks.forEach((w, n) => { if (n !== i) assert.doesNotMatch(w.withNewPage, /The Compass/, `${k} week ${n + 1} should not push the Compass`) })
  }
})

test('the member app plan carries the featured tool for each week', async () => {
  const { planFor } = await import('../lib/newpage-app.js')
  const plan = planFor({ quadrant: 'explore', answers: null, personal: {} })
  assert.deepEqual(plan.weeks.map(w => w.tool), [null, null, 'compass', null])
})
