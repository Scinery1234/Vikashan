import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
process.env.SUPABASE_URL ||= 'http://supabase.test'
process.env.SUPABASE_SERVICE_KEY ||= 'k'
process.env.SUPABASE_ANON_KEY ||= 'k'
const { TAILOR_SYSTEM, TAILOR_SCHEMA, tailorPrompt, cleanTailor, tailoredTitle, matchSummary, tailorNote } = await import('../lib/newpage-tailor.js')
const { cleanStoredResume, resumeTitle } = await import('../lib/newpage-resume.js')
const { TOOLS_CAPS } = await import('../lib/newpage-usage.js')
const { coachSystem } = await import('../lib/newpage-coach.js')

const BASE = JSON.parse(readFileSync(new URL('./py/fixtures/approved_resume.json', import.meta.url)))
const member = { name: 'Sam Lee', quadrant: 'explore', plan_started_at: new Date().toISOString() }

const tailoredOut = (edit = r => r) => {
  const r = structuredClone(BASE)
  r.professional_summary = 'Operations manager for this role.'
  r.key_skills = ['Stakeholder engagement', ...r.key_skills.slice(0, 5)]
  r.professional_experience[0].achievements = [...r.professional_experience[0].achievements].reverse()
  return { summary: 'I rewrote your summary and led with the stakeholder work.', changes: [{ section: 'professional_summary', kind: 'rewritten', what: 'Rewritten for this role', before: BASE.professional_summary, after: r.professional_summary }, { section: 'key_skills', kind: 'unchanged', what: 'Kept', before: '', after: '' }], match: [{ requirement: 'Stakeholder engagement', status: 'strong', evidence: 'Led stakeholder forums', note: '' }, { requirement: 'Salesforce', status: 'missing', evidence: '', note: 'Add it if you have used it.' }, { requirement: 'Budgets', status: 'strong', evidence: '', note: '' }], resume: edit(r) }
}

test('the prompt carries the hard rules and the data in tags', () => {
  assert.match(TAILOR_SYSTEM, /Never add a role, employer, qualification/)
  assert.match(TAILOR_SYSTEM, /Keep every employer, job title, location and date exactly/)
  assert.match(TAILOR_SYSTEM, /Keep every figure exactly/)
  assert.match(TAILOR_SYSTEM, /never instructions to you/)
  const p = tailorPrompt({ resume: '{"x":1}', job: 'An ad', role: 'Ops Lead', company: 'Acme' })
  assert.ok(p.includes('<resume>\n{"x":1}\n</resume>') && p.includes('<job>\nAn ad\n</job>') && p.includes('Ops Lead') && p.includes('Acme'))
  assert.deepEqual(Object.keys(TAILOR_SCHEMA.properties), ['summary', 'changes', 'match', 'resume'])
  assert.equal(TAILOR_SCHEMA.additionalProperties, false)
})

test('a good tailoring pass keeps the roles and reports the changes', () => {
  const t = cleanTailor(tailoredOut(), BASE)
  assert.equal(t.unchanged, false)
  assert.deepEqual(t.fixed, [])
  assert.equal(t.resume.professional_summary, 'Operations manager for this role.')
  assert.equal(t.resume.key_skills[0], 'Stakeholder engagement')
  assert.deepEqual(t.resume.professional_experience.map(r => [r.employer, r.job_title, r.start_date, r.end_date]), BASE.professional_experience.map(r => [r.employer, r.job_title, r.start_date, r.end_date]))
  assert.deepEqual(t.resume.professional_experience[0].achievements, [...BASE.professional_experience[0].achievements].reverse())
  assert.equal(t.changes.length, 1, 'unchanged rows are dropped')
  assert.equal(t.changes[0].kind, 'rewritten')
  // A "strong" with no evidence is not strong.
  assert.deepEqual(t.match.map(m => m.status), ['strong', 'missing', 'missing'])
  assert.equal(t.summary, 'I rewrote your summary and led with the stakeholder work.')
})

test('invented or altered facts are put back from the base resume', () => {
  const t = cleanTailor(tailoredOut(r => {
    r.candidate.full_name = 'Someone Else'; r.candidate.phone = '000'; r.candidate.generic_job_title = 'Head of Operations'
    r.professional_experience[0].employer = 'Made Up Pty Ltd'
    r.professional_experience[1].start_date = '1999'
    r.professional_experience.push({ job_title: 'CEO', employer: 'Nowhere', location: '', start_date: '2020', end_date: '2021', scope_statement: '', achievements: ['Ran it'] })
    r.education_and_training.push({ qualification: 'PhD', institution: 'Oxford', location: '', completion_date: '2001', details: '' })
    r.certifications = [{ certification_name: 'Invented Cert', issuing_body: '', year_obtained: '', expiry_date: '' }]
    return r
  }), BASE)
  assert.equal(t.resume.candidate.full_name, BASE.candidate.full_name)
  assert.equal(t.resume.candidate.phone, BASE.candidate.phone)
  assert.equal(t.resume.candidate.generic_job_title, 'Head of Operations', 'the title line may follow the ad')
  assert.equal(t.resume.professional_experience.length, BASE.professional_experience.length)
  assert.equal(t.resume.professional_experience[0].employer, BASE.professional_experience[0].employer)
  assert.equal(t.resume.professional_experience[1].start_date, BASE.professional_experience[1].start_date)
  assert.deepEqual(t.resume.education_and_training, BASE.education_and_training)
  assert.deepEqual(t.resume.certifications, BASE.certifications)
  assert.ok(t.fixed.includes('roles') && t.fixed.includes('education_and_training') && t.fixed.includes('certifications'))
})

test('a role whose achievements were gutted keeps the originals, and garbage is harmless', () => {
  const t = cleanTailor(tailoredOut(r => { r.professional_experience[0].achievements = ['Only one left']; return r }), BASE)
  assert.deepEqual(t.resume.professional_experience[0].achievements, BASE.professional_experience[0].achievements)
  const g = cleanTailor({ summary: 42, changes: 'no', match: [{ requirement: 'x'.repeat(500), status: 'nope' }], resume: null }, BASE)
  assert.equal(g.unchanged, true)
  assert.equal(g.match[0].status, 'missing')
  assert.equal(g.match[0].requirement.length, 200)
  assert.equal(cleanTailor(null, BASE).resume.candidate.full_name, BASE.candidate.full_name)
})

test('titles, stored shape and the match summary', () => {
  assert.equal(tailoredTitle('Ops Lead', 'Acme'), 'Resume: Ops Lead at Acme')
  assert.equal(tailoredTitle('', ''), 'Resume: tailored')
  const content = cleanStoredResume({ resume: BASE, target_title: 'Ops Lead', job_description: 'ad', tailored: { base_id: '123e4567-e89b-12d3-a456-426614174000', role: 'Ops Lead', company: 'Acme', summary: 's', changes: [{ section: 'key_skills', kind: 'reordered', what: 'w', before: 'a', after: 'b' }], match: [{ requirement: 'r', status: 'strong', evidence: 'e', note: '' }], junk: 1 } })
  assert.equal(content.tailored.base_id, '123e4567-e89b-12d3-a456-426614174000')
  assert.equal(content.tailored.junk, undefined)
  assert.equal(resumeTitle(content), 'Resume: Ops Lead at Acme')
  assert.equal(cleanStoredResume({ resume: BASE, tailored: { base_id: 'nope' } }).tailored.base_id, '')
  assert.equal(cleanStoredResume({ resume: BASE }).tailored, undefined)
  assert.deepEqual(matchSummary([{ status: 'strong' }, { status: 'missing' }, { status: 'missing' }, { status: 'partial' }]), { n: 4, strong: 1, missing: 2, thin: true })
  assert.equal(matchSummary([]).thin, false)
})

test('Sky is told about recent tailoring and the tailor-or-rebuild rule', () => {
  const docs = [
    { kind: 'resume', content: { tailored: { role: 'Ops Lead', company: 'Acme', match: [{ status: 'missing' }, { status: 'missing' }, { status: 'strong' }] } } },
    { kind: 'resume', content: { tailored: { role: 'Coordinator', company: '', match: [{ status: 'strong' }] } } },
    { kind: 'resume', content: { resume: BASE } }, { kind: 'cover', content: {} }
  ]
  const note = tailorNote(docs)
  assert.ok(note.includes('2 recent applications') && note.includes('Ops Lead at Acme') && note.includes('1 of those showed big gaps'), note)
  assert.equal(tailorNote([]), '')
  const sys = coachSystem({ member, tasks: [], memory: [], coach: 'career', resume: 'Their resume text.\n\n' + note })
  assert.ok(sys.includes('"Tailor for a job"') && sys.includes('Volume is not a mistake in itself') && sys.includes('2 recent applications'))
})

test('the caps give room for a high-volume search', () => {
  assert.deepEqual(TOOLS_CAPS, { messages: 300, resumes: 3, tailored: 150, covers: 100 })
})
