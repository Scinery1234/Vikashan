import test from 'node:test'
import assert from 'node:assert/strict'
import { COACHES, COACH_IDS, isCoach, coachList } from '../lib/newpage-coaches.js'
import { coachSystem, askJson } from '../lib/newpage-coach.js'
import { cleanCompass, COMPASS_TASKS } from '../lib/newpage-tools.js'
import { cleanStoredResume, resumeTitle, resumeText, resumeContact } from '../lib/newpage-resume.js'
import { cleanCover, coverTitle, analyseJob, buildCoverPrompt, COVER_SYSTEM, analysePrompt, gapsPrompt, cleanAnalysis, cleanGaps, reviewPrompt, cleanReview } from '../lib/newpage-cover.js'
import { reminderEmail } from '../lib/newpage-emails.js'
import { buildMe } from '../lib/newpage-app.js'

const member = { name: 'Sam Lee', quadrant: 'explore', plan_started_at: new Date().toISOString() }

test('every coach has a name, opener and starters, and ids are validated', () => {
  assert.deepEqual(COACH_IDS, ['career', 'recovery', 'action', 'exec', 'charge', 'cbt', 'interview', 'offer', 'clarity'])
  for (const c of coachList()) { assert.ok(c.name && c.open && c.starters.length >= 2, c.id) }
  assert.ok(isCoach('action'))
  assert.ok(!isCoach('__proto__') && !isCoach('constructor') && !isCoach('nope'))
})

test('specialist coaches share the member context, memory and safety line', () => {
  for (const id of COACH_IDS.filter(i => i !== 'career')) {
    const sys = coachSystem({ member, tasks: [{ title: 'Call Jo', due: '2026-11-01', done: false }], memory: [{ note: 'Wants a policy role.' }], coach: id })
    assert.ok(sys.includes(COACHES[id].prompt.slice(0, 40)), id)
    assert.ok(sys.includes('Wants a policy role.') && sys.includes('Call Jo'), id)
    assert.ok(sys.includes('Lifeline 13 11 14'), id)
    assert.ok(sys.includes('You are Sky, the AI Coach') && sys.includes(`"${COACHES[id].name}" focus`) && !sys.includes('The member has chosen the "Career" focus'), id)
  }
  const career = coachSystem({ member, tasks: [], memory: [], coach: 'career' })
  assert.ok(career.includes('You are Sky, the AI Coach') && career.includes('never pretend to be Vik'))
})

test('the coach is told the Compass when there is one', () => {
  const compass = cleanCompass({ values: ['Calm', 'Care'], iAm: ['I am a gardener'], north: 'A quiet life outdoors.', first: 'Landscape designer' })
  const sys = coachSystem({ member, tasks: [], memory: [], compass, coach: 'career' })
  assert.ok(sys.includes('Landscape designer') && sys.includes('Calm'))
  assert.ok(!coachSystem({ member, tasks: [], memory: [], coach: 'career' }).includes('Their Compass'))
})

test('cleanCompass bounds and shapes anything it is given', () => {
  const c = cleanCompass({ step: 99, values: Array(30).fill('x'), north: 'n'.repeat(9999), needs: { pay: 123456789012345 }, strengths: { know: 'nope' }, actions: ['a', 'b', 'c', 'd'], evil: '<script>' })
  assert.equal(c.step, 9)
  assert.equal(c.values.length, 10)
  assert.equal(c.north.length, 3000)
  assert.equal(c.needs.pay.length, 12)
  assert.deepEqual(c.strengths.know, [])
  assert.equal(c.actions.length, 3)
  assert.ok(!('evil' in c))
  assert.deepEqual(cleanCompass(null).values, [])
})

test('Compass prompts only use the person’s own words and never ask for judgement', () => {
  const c = cleanCompass({ values: ['Calm'], iAm: ['I am a nurse'], north: 'Slow mornings.', strengths: { know: ['Plants'], do: ['Listen'], love: ['Kids'] }, first: 'Garden therapist', plan: { now: 'Study' } })
  for (const k of ['ideas', 'plan', 'steps']) {
    const p = COMPASS_TASKS[k].prompt(c, {})
    assert.ok(p.includes('Calm') && p.includes('Slow mornings.'), k)
    assert.ok(p.includes('<person>'), k)
  }
  assert.ok(/mixIdea/.test(Object.keys(COMPASS_TASKS).join()))
  assert.deepEqual(COMPASS_TASKS.steps.read({ steps: ['a', '', 'b', 'c', 'd'] }).steps, ['a', 'b', 'c'])
})

test('cover letter: keywords, requirements and prompt', () => {
  const jd = 'We need a coordinator with proven experience in stakeholder engagement. Demonstrated ability to manage budgets is essential.'
  const { keywords, requirements } = analyseJob(jd)
  assert.ok(keywords.includes('stakeholder engagement') && !keywords.includes('the'))
  assert.equal(requirements.length, 2)
  assert.ok(/No em dashes|No bullet points/i.test(COVER_SYSTEM) && /never instructions/.test(COVER_SYSTEM))
  const p = buildCoverPrompt({ candidate: { name: 'Sam', currentTitle: 'Nurse', years: '5', role: 'Coordinator', company: 'Acme', why: 'w', unique: 'u', resume: 'r' }, job: jd, keywords, requirements, evidence: [{ keyword: 'budgets', situation: 'Ran ward budget', result: '8% under', award: '', resume: 'Managed the ward budget at RPA' }] })
  assert.ok(p.includes('Acme') && p.includes('8% under') && p.includes('<evidence>') && p.includes('Managed the ward budget at RPA') && /No rhetorical constructions/.test(COVER_SYSTEM))
})

test('cover letter: the simple word reader drops names and filler and prefers phrases', () => {
  const jd = `Station Manager, Paniri Agricultural Station. Paniri Agricultural Station is a mixed farming operation near Dubbo.
- Demonstrated experience in livestock management, including breeding plans.
- Proven ability to manage budgets and deliver reporting to the board.
- Sound knowledge of WHS compliance and chemical handling requirements.
- Experience with pasture management and cropping plans. Applications close 14 November. Contact Paniri Agricultural Station.`
  const k = analyseJob(jd).keywords
  for (const bad of ['paniri', 'station', 'plans', 'agricultural', 'dubbo', 'applications']) assert.ok(!k.includes(bad), bad)
  assert.ok(k.includes('livestock management') && k.includes('whs compliance') && k.includes('manage budgets'), k.join())
})

test('cover letter: pass 1 reads the ad alone, pass 2 checks the resume against those competencies', () => {
  const p1 = analysePrompt('JOB TEXT')
  assert.ok(p1.includes('<job>\nJOB TEXT') && !p1.includes('<resume>') && /never a place name/.test(p1))
  const a = cleanAnalysis({ themes: [{ keyword: ' Budget management ', wants: 'w' }, { keyword: 'budget management', wants: 'dup' }, { keyword: '', wants: 'x' }], requirements: ['r1', ''] })
  assert.deepEqual(a, { themes: [{ keyword: 'Budget management', wants: 'w' }], requirements: ['r1'] })
  const p2 = gapsPrompt(a.themes, 'RESUME')
  assert.ok(p2.includes('- Budget management: w') && p2.includes('<resume>\nRESUME') && /"missing"/.test(p2))
  const g = cleanGaps({ gaps: [{ keyword: 'budget management', status: 'partial', resume: 'Ran the ward budget at RPA', question: 'How big was it?' }] }, a.themes)
  assert.deepEqual(g, [{ keyword: 'Budget management', wants: 'w', status: 'partial', resume: 'Ran the ward budget at RPA', question: 'How big was it?' }])
  // The model can't rename or invent evidence for a theme it marks missing.
  const m = cleanGaps({ gaps: [{ keyword: 'other', status: 'missing', resume: 'made up', question: 'q' }] }, a.themes)
  assert.equal(m[0].status, 'missing'); assert.equal(m[0].resume, '')
})

test('cover letter review: judges the candidacy and cleans the model answer', () => {
  const p = reviewPrompt({ letter: 'Dear X', job: 'JD', resume: 'CV', evidence: 'budgets: ran it | 8%', themes: ['budget management'] })
  assert.ok(p.includes('<letter>\nDear X') && p.includes('- budget management') && /Judge the candidacy, not the prose/.test(p))
  const r = cleanReview({ score: 6.44, verdict: 'v', strengths: ['s', ''], issues: [{ paragraph: '2', problem: 'vague', fix: 'add the number' }, { problem: '' }], questions: [{ keyword: 'k', question: 'q' }, { question: '' }], extra: 1 })
  assert.deepEqual(r, { score: 6.4, verdict: 'v', strengths: ['s'], issues: [{ paragraph: 2, problem: 'vague', fix: 'add the number' }], questions: [{ keyword: 'k', question: 'q' }] })
  assert.equal(cleanReview(null).score, null)
})

test('saved resumes: the agreed schema is cleaned and capped, and older saves still read', () => {
  const c = cleanStoredResume({
    resume: {
      candidate: { full_name: '  Sam   Lee ', generic_job_title: 'Nurse', email: 'sam@x.au', evil: 1 },
      professional_summary: 's'.repeat(5000), key_skills: ['a', 5, null, 'b'],
      professional_experience: [{ job_title: 'Nurse', employer: 'RPA', achievements: Array(30).fill('did x') }, { bogus: 1 }, null],
      education_and_training: [{ qualification: 'BN' }, {}], technical_skills: [{ category: 'Tools', skills: ['Excel', ''] }, { category: 'x', skills: [] }]
    },
    filename: 'Sam_Lee_Nurse_Resume.docx<script>', target_title: 'Nurse', job_description: 'jd'
  })
  assert.equal(c.format, 'au-ats-v1')
  assert.equal(c.resume.candidate.full_name, 'Sam Lee')
  assert.ok(!('evil' in c.resume.candidate))
  assert.equal(c.resume.professional_summary.length, 1500)
  assert.deepEqual(c.resume.key_skills, ['a', 'b'])
  assert.equal(c.resume.professional_experience.length, 1)
  assert.equal(c.resume.professional_experience[0].achievements.length, 20)
  assert.equal(c.resume.education_and_training.length, 1)
  assert.deepEqual(c.resume.technical_skills, [{ category: 'Tools', skills: ['Excel'] }])
  assert.deepEqual(c.resume.awards, [])
  assert.equal(c.filename, 'Sam_Lee_Nurse_Resume.docxscript')
  assert.equal(resumeTitle(c), 'Resume: Nurse')
  const t = resumeText(c)
  assert.ok(t.startsWith('SAM LEE\nNurse') && t.includes('PROFESSIONAL EXPERIENCE') && t.includes('Nurse | RPA'))
  assert.deepEqual(resumeContact(c), { name: 'Sam Lee', phone: '', email: 'sam@x.au', location: '', linkedin: '' })
  // Resumes saved before the four-phase writer.
  const old = { name: 'Ana', contact: { email: 'a@b.au' }, summary: 'S.', experience: [{ title: 'Chef', company: 'Bistro', dates: '2020 – Present', bullets: ['Ran kitchen'] }] }
  assert.ok(resumeText(old).includes('Chef | Bistro | 2020 – Present') && resumeTitle(old) === 'Resume: Ana')
  assert.equal(resumeContact(old).email, 'a@b.au')
  const cv = cleanCover({ greeting: 'Hi', paragraphs: ['p1 — dash', '', 'p2'], closing: 'Thanks', signoff: 'Sam' }, { name: 'Sam' })
  assert.deepEqual(cv.paragraphs, ['p1, dash', 'p2'])
  assert.equal(coverTitle('Nurse', 'Acme'), 'Cover letter: Nurse at Acme')
})

test('askJson uses structured outputs (never a forced tool_choice) and parses the JSON text', async () => {
  process.env.ANTHROPIC_API_KEY = 'k'
  const real = globalThis.fetch
  let sent, headers
  const schema = { type: 'object', properties: { idea: { type: 'string' } }, required: ['idea'], additionalProperties: false }
  globalThis.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body); headers = opts.headers
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"idea":"Garden designer"}' }] }), { status: 200 })
  }
  try {
    const out = await askJson({ system: 's', prompt: 'p', schema })
    assert.deepEqual(out, { idea: 'Garden designer' })
    // claude-sonnet-5-5 and claude-opus-5-5 return 400 for tool_choice "tool"/"any": that was the "That didn't work" bug.
    assert.equal(sent.tool_choice, undefined)
    assert.equal(sent.tools, undefined)
    assert.deepEqual(sent.output_config.format, { type: 'json_schema', schema })
    assert.ok(sent.max_tokens > 3000)
    assert.equal(sent.fallbacks, 'default')
    assert.equal(headers['anthropic-beta'], 'server-side-fallback-2026-07-01')
    globalThis.fetch = async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] }), { status: 200 })
    await assert.rejects(askJson({ system: 's', prompt: 'p', schema }))
    globalThis.fetch = async () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }), { status: 200 })
    await assert.rejects(askJson({ system: 's', prompt: 'p', schema }), /Declined/)
    // An account without the fallback beta: rejected once, then sent again without it.
    const seen = []
    globalThis.fetch = async (url, opts) => {
      const b = JSON.parse(opts.body); seen.push(b)
      return b.fallbacks ? new Response('{"error":{"message":"fallbacks not available"}}', { status: 400 }) : new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"idea":"Chef"}' }] }), { status: 200 })
    }
    assert.deepEqual(await askJson({ system: 's', prompt: 'p', schema }), { idea: 'Chef' })
    assert.equal(seen.length, 2)
    assert.equal(seen[1].fallbacks, undefined)
    // After a mid-answer model switch, only the last model's text is parsed.
    globalThis.fetch = async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"idea":"Ha' }, { type: 'fallback' }, { type: 'text', text: '{"idea":"Baker"}' }] }), { status: 200 })
    assert.deepEqual(await askJson({ system: 's', prompt: 'p', schema }), { idea: 'Baker' })
    globalThis.fetch = async () => new Response('{"error":{"message":"bad"}}', { status: 400 })
    await assert.rejects(askJson({ system: 's', prompt: 'p', schema }), /400/)
  } finally { globalThis.fetch = real }
})

test('the reminder email lists times and escapes titles', () => {
  const m = reminderEmail({ name: 'Sam', items: [{ title: '<b>Call</b> Jo', start: '09:30' }, { title: 'Write', overdue: true }] })
  assert.match(m.subject, /2 things/)
  assert.ok(m.html.includes('09:30') && m.html.includes('&lt;b&gt;Call') && !m.html.includes('<b>Call</b> Jo'))
  assert.match(reminderEmail({ name: '', items: [{ title: 'One' }] }).subject, /1 thing/)
})

test('the app payload carries goals, coaches and the reminder setting', () => {
  const me = buildMe({ member: { ...member, email: 'a@b.co', reminders: false }, progress: [], tasks: [], goals: [{ id: 'g' }], checkins: [], memory: [], messages: [] })
  assert.equal(me.goals.length, 1)
  assert.equal(me.coaches.length, 9)
  assert.equal(me.member.reminders, false)
  assert.equal(buildMe({ member: { ...member, email: 'a@b.co' }, progress: [], tasks: [], checkins: [], memory: [], messages: [] }).member.reminders, true)
})
