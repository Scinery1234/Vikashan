// Saved resumes. The resume itself is written by the four-phase resume agent
// in api/newpage/resume.py (Python, shared with Resume-Generator). This file
// only stores the finished, approved resume and reads it back as text for the
// cover letter writer. The resume JSON is the agreed schema from
// Resume-Generator docs/RESUME_AGENT_SPEC.md section 8.2; older saved resumes
// ({name, contact, summary, experience, ...}) are still read.

const str = (v, n = 1500) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const list = (v, n = 20, len = 1500) => (Array.isArray(v) ? v.map(x => str(x, len)).filter(Boolean).slice(0, n) : [])
const rows = (v, fields, keep, n = 15) => (Array.isArray(v) ? v : []).slice(0, n)
  .filter(r => r && typeof r === 'object')
  .map(r => Object.fromEntries(fields.map(f => [f, LIST_FIELDS.has(f) ? list(r[f]) : str(r[f], ['details', 'scope_statement'].includes(f) ? 1500 : 200)])))
  .filter(r => keep.some(k => (Array.isArray(r[k]) ? r[k].length : r[k])))

const LIST_FIELDS = new Set(['achievements', 'skills'])
export const RESUME_FORMAT = 'au-ats-v1'

// Same shape as resume_agent/schema.py normalise().
export function normaliseResume(r) {
  r = r && typeof r === 'object' ? r : {}
  const c = r.candidate && typeof r.candidate === 'object' ? r.candidate : {}
  return {
    candidate: Object.fromEntries(['full_name', 'generic_job_title', 'location', 'phone', 'email', 'linkedin'].map(k => [k, str(c[k], 200)])),
    professional_summary: str(r.professional_summary),
    key_skills: list(r.key_skills, 12, 200),
    professional_experience: rows(r.professional_experience, ['job_title', 'employer', 'location', 'start_date', 'end_date', 'scope_statement', 'achievements'], ['job_title', 'employer']),
    education_and_training: rows(r.education_and_training, ['qualification', 'institution', 'location', 'completion_date', 'details'], ['qualification', 'institution']),
    awards: rows(r.awards, ['award_name', 'issuing_organisation', 'year', 'details'], ['award_name']),
    certifications: rows(r.certifications, ['certification_name', 'issuing_body', 'year_obtained', 'expiry_date'], ['certification_name']),
    technical_skills: rows(r.technical_skills, ['category', 'skills'], ['skills']),
    additional_information: rows(r.additional_information, ['category', 'details'], ['details'])
  }
}

// What is stored in newpage_docs.content for a finished resume.
export function cleanStoredResume(b) {
  return {
    format: RESUME_FORMAT,
    resume: normaliseResume(b?.resume),
    filename: str(b?.filename, 160).replace(/[^\w .'-]/g, ''),
    target_title: str(b?.target_title, 200),
    job_description: typeof b?.job_description === 'string' ? b.job_description.trim().slice(0, 20000) : ''
  }
}

const isNew = c => c && (c.format === RESUME_FORMAT || c.resume?.candidate)

export function resumeTitle(content) {
  const r = isNew(content) ? content.resume : null
  const role = content?.target_title || r?.candidate?.generic_job_title
  const name = r?.candidate?.full_name || content?.name
  return `Resume${role ? ': ' + role : name ? ': ' + name : ''}`.slice(0, 160)
}

// Name and contact details, whichever shape the resume was saved in.
export function resumeContact(content) {
  if (isNew(content)) {
    const c = content.resume.candidate
    return { name: c.full_name, phone: c.phone, email: c.email, location: c.location, linkedin: c.linkedin }
  }
  const c = content?.contact || {}
  return { name: content?.name || '', phone: c.phone, email: c.email, location: c.location, linkedin: c.linkedin }
}

// Plain text of a saved resume, for the cover letter writer.
export function resumeText(content) {
  if (!content) return ''
  if (isNew(content)) {
    const d = content.resume
    const c = d.candidate
    const out = [c.full_name.toUpperCase(), c.generic_job_title, [c.location, c.phone, c.email, c.linkedin].filter(Boolean).join(' | ')].filter(Boolean)
    const sec = (t, lines) => { if (lines.length) out.push('', t.toUpperCase(), ...lines) }
    sec('Professional Summary', d.professional_summary ? [d.professional_summary] : [])
    sec('Key Skills', d.key_skills.map(s => `- ${s}`))
    sec('Professional Experience', d.professional_experience.flatMap(r => [
      [r.job_title, r.employer, r.location].filter(Boolean).join(' | ') + (r.start_date ? ` | ${[r.start_date, r.end_date].filter(Boolean).join(' to ')}` : ''),
      ...(r.scope_statement ? [r.scope_statement] : []), ...r.achievements.map(a => `- ${a}`)]))
    sec('Education and Training', d.education_and_training.map(e => [e.qualification, e.institution, e.completion_date].filter(Boolean).join(', ')))
    sec('Awards', d.awards.map(a => `- ${[a.award_name, a.issuing_organisation, a.year].filter(Boolean).join(', ')}`))
    sec('Certifications', d.certifications.map(x => `- ${[x.certification_name, x.issuing_body, x.year_obtained].filter(Boolean).join(', ')}`))
    sec('Technical Skills', d.technical_skills.map(g => `${g.category ? g.category + ': ' : ''}${g.skills.join(', ')}`))
    sec('Additional Information', d.additional_information.map(i => `- ${i.category ? i.category + ': ' : ''}${i.details}`))
    return out.join('\n')
  }
  // Older saved resumes.
  const r = content
  const out = []
  if (r.name) out.push(String(r.name).toUpperCase())
  const c = [r.contact?.phone, r.contact?.email, r.contact?.location, r.contact?.linkedin].filter(Boolean).join(' | ')
  if (c) out.push(c)
  if (r.summary) out.push('', 'PROFESSIONAL SUMMARY', r.summary)
  if (r.key_skills?.length) out.push('', 'KEY SKILLS', ...r.key_skills.map(s => `- ${s}`))
  if (r.experience?.length) {
    out.push('', 'PROFESSIONAL EXPERIENCE')
    for (const e of r.experience) out.push('', [e.title, e.company, e.location, e.dates].filter(Boolean).join(' | '), ...(e.bullets || []).map(b => `- ${b}`))
  }
  if (r.education?.length) out.push('', 'EDUCATION', ...r.education.map(e => [e.degree, e.institution, e.year].filter(Boolean).join(', ')))
  if (r.certifications?.length) out.push('', 'CERTIFICATIONS', ...r.certifications.map(s => `- ${s}`))
  return out.join('\n')
}
