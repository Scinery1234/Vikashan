// Resume writer, two paths.
// Write a new resume: the four-phase Australian resume agent (api/newpage/resume.py).
//   1. Upload or paste your resume (and the job ad, as a PDF if you like).
//   2. Read the full draft, ask for changes, approve it. This is the only approval.
//   3. The approved resume is shown as JSON ("Phase 2, Prepare"), then straight away
//   4. the Python script is generated, run and checked, and the Word file is yours.
// Tailor for a job: a saved resume plus one ad, one short call (resume_tailor in
// api/newpage/app.js). Comes back with what changed and how the ad is matched; the
// Word file is built from the result without another model call (action 'build').
// The gates live on the server; this screen shows the conversation and the results.
import { h, copyText } from './ui.js'
import { saveB64, DOCX_TYPE, fileToB64, resumeFileProblem, safeName } from './docfiles.js'

const API = '/api/newpage/resume'
const QUICK = { AWAITING_CONTENT_APPROVAL: 'Yes', EXECUTION_FAILED: 'Try again' }
// Replies that approve the content, which also builds the Word file (for the busy message only).
const APPROVAL = /^(y|yes|yep|yeah|approved?|looks good|proceed|go ahead|content approved|perfect|lgtm|try again|retry)\b/i
const L = {
  text: null, fileName: '', job: '', jobFile: '', role: '', extra: '', uploading: '', busy: '', err: '', note: '', conv: null, docs: null, docId: null, loading: false, reply: '', pasteOpen: false,
  mode: null, baseId: '', tailJob: '', tailJobFile: '', tailRole: '', tailCo: '', tail: null, files: {}, showAll: false
}

const SECTION_NAMES = { professional_summary: 'Summary', key_skills: 'Key skills', professional_experience: 'Experience', education_and_training: 'Education and training', certifications: 'Certifications', technical_skills: 'Technical skills', additional_information: 'Additional information', awards: 'Awards', candidate: 'Title line' }
const KIND_NAMES = { rewritten: 'Rewritten', reordered: 'Reordered', sharpened: 'Sharpened', added: 'Added', removed: 'Left out', unchanged: 'Unchanged' }
const STATUS = { strong: ['In your resume', 'ok'], partial: ['Thin', 'part'], missing: ['Not in your resume', 'gap'] }
const when = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

// A resume the writer made (the agreed JSON shape) can be tailored; older saved text cannot.
const isBuilt = d => !!d?.content?.resume?.candidate
const isTailored = d => !!d?.content?.tailored
const bases = () => (L.docs || []).filter(d => d.kind === 'resume' && isBuilt(d) && !isTailored(d))

async function load(ctx) {
  if (L.text !== null || L.loading) return
  L.loading = true
  try {
    const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
    L.text = p.data.text || ''
    L.docs = d.docs
  } catch (e) { L.text = ''; L.docs = []; L.err = e.message }
  if (!L.mode) L.mode = bases().length ? 'tailor' : 'new'
  if (!L.baseId && bases().length) L.baseId = bases()[0].id
  L.loading = false
  ctx.render()
}

const agent = (ctx, body) => ctx.call(API, { token: ctx.token(), ...body })

async function upload(ctx, file, into) {
  if (!file) return
  const problem = resumeFileProblem(file)
  if (problem) { L.err = problem; ctx.render(); return }
  L.uploading = into; L.err = ''; ctx.render()
  try {
    const d = await agent(ctx, { action: 'extract', filename: file.name, file: await fileToB64(file) })
    if (into === 'job') { L.job = d.text; L.jobFile = file.name } else if (into === 'tailjob') { L.tailJob = d.text; L.tailJobFile = file.name } else { L.text = d.text; L.fileName = file.name; L.pasteOpen = true }
  } catch (e) { L.err = e.message }
  L.uploading = ''; ctx.render()
}

const errText = e => (e.code === 'coach_off' ? 'The resume writer isn’t switched on yet.' : e.message)

function scrollToEnd() { requestAnimationFrame(() => document.getElementById('ra-end')?.scrollIntoView({ block: 'end', behavior: 'smooth' })) }
const scrollTop = () => requestAnimationFrame(() => document.querySelector('.screen.docs')?.scrollIntoView({ block: 'start' }))

async function start(ctx) {
  if (L.busy) return
  if ((L.text || '').trim().length < 80) { L.err = 'Add your current resume first: upload it, or paste your roles, dates and what you achieved.'; ctx.render(); return }
  L.busy = 'Drafting your resume. This can take up to a minute.'; L.err = ''; ctx.render()
  ctx.call('/api/newpage/app', { action: 'tool_save', tool: 'profile', data: { text: L.text } }).catch(() => {})
  try {
    const d = await agent(ctx, { action: 'start', materials: L.text, job_description: L.job, target_title: L.role, additional: L.extra })
    L.conv = { session: d.session, state: d.state, resume: d.resume, messages: d.messages.map(m => ({ role: 'agent', ...m })) }
    L.docId = null; L.tail = null
  } catch (e) { L.err = errText(e) }
  L.busy = ''; ctx.render(); scrollToEnd()
}

async function send(ctx, text) {
  const msg = String(text ?? L.reply).trim()
  if (!msg || L.busy || !L.conv) return
  const generating = L.conv.state !== 'DRAFTING' && APPROVAL.test(msg) && msg.split(/\s+/).length <= 4
  L.conv.messages.push({ role: 'user', text: msg })
  L.reply = ''; L.err = ''
  L.busy = generating ? 'Building your Word resume and checking it…' : 'Working on it…'
  ctx.render(); scrollToEnd()
  try {
    const d = await agent(ctx, { action: 'reply', session: L.conv.session, message: msg })
    Object.assign(L.conv, { session: d.session, state: d.state, resume: d.resume })
    L.conv.messages.push(...d.messages.map(m => ({ role: 'agent', ...m })))
    const done = d.messages.find(m => m.kind === 'result' && m.ok)
    if (done) {
      try {
        const cur = (L.docs || []).find(x => x.id === L.docId)
        const s = await ctx.call('/api/newpage/app', { action: 'resume_save', id: L.docId, resume: d.resume, filename: done.filename, target_title: L.role, job_description: L.job, tailored: cur?.content?.tailored })
        L.docId = s.doc.id || L.docId
        L.docs = [s.doc, ...(L.docs || []).filter(x => x.id !== s.doc.id)]
        delete L.files[s.doc.id]
        if (!L.baseId) L.baseId = s.doc.id
      } catch { /* the file is still downloadable; saving is a convenience */ }
    }
  } catch (e) { L.err = errText(e) }
  L.busy = ''; ctx.render(); scrollToEnd()
}

async function openSaved(ctx, doc) {
  if (L.busy) return
  L.busy = 'Opening your saved resume…'; L.err = ''; ctx.render()
  try {
    const content = doc.content || {}
    const d = await agent(ctx, { action: 'open', resume: content.resume || content, materials: L.text || '', job_description: content.job_description || '', target_title: content.target_title || '' })
    L.conv = { session: d.session, state: d.state, resume: d.resume, messages: d.messages.map(m => ({ role: 'agent', ...m })) }
    L.docId = doc.id; L.role = content.target_title || ''; L.job = content.job_description || ''; L.tail = null
  } catch (e) { L.err = errText(e) }
  L.busy = ''; ctx.render(); scrollToEnd()
}

// ── Tailor for a job ──
async function tailor(ctx) {
  if (L.busy) return
  if (!L.baseId) { L.err = 'Choose the resume to tailor.'; ctx.render(); return }
  if (L.tailJob.trim().length < 60) { L.err = 'Paste the whole job ad first.'; ctx.render(); return }
  L.busy = 'Tailoring your resume for this ad. About a minute.'; L.err = ''; ctx.render()
  try {
    const d = await ctx.call('/api/newpage/app', { action: 'resume_tailor', id: L.baseId, job: L.tailJob, role: L.tailRole, company: L.tailCo })
    L.docs = [d.doc, ...(L.docs || [])]
    L.tail = d.doc; L.conv = null; L.showAll = false
  } catch (e) { L.err = e.code === 'usage_cap' ? e.message : errText(e) }
  L.busy = ''; ctx.render(); scrollTop()
}

// The Word file for a tailored resume: built from the saved JSON, no model call, cached per document.
async function wordFile(ctx, doc) {
  const k = doc.id
  if (L.files[k]) return L.files[k]
  if (L.files['busy:' + k]) return null
  L.files['busy:' + k] = true; L.err = ''; ctx.render()
  try {
    const r = await agent(ctx, { action: 'build', resume: doc.content.resume, target_title: doc.content.target_title || '' })
    L.files[k] = { filename: r.filename || `${safeName(doc.title)}.docx`, docx: r.docx }
  } catch (e) { L.err = e.message }
  delete L.files['busy:' + k]
  ctx.render()
  return L.files[k] || null
}

async function download(ctx, doc) {
  const f = await wordFile(ctx, doc)
  if (f) saveB64(f.filename, f.docx, DOCX_TYPE)
}

// Hand the ad and this tailored resume to the cover letter writer.
function toCover(ctx, doc) {
  const t = doc.content.tailored || {}
  try { sessionStorage.setItem('np-cover-handoff', JSON.stringify({ job: doc.content.job_description || '', role: t.role || '', company: t.company || '', resume_id: doc.id, title: doc.title })) } catch { /* private mode */ }
  ctx.go('tools', 'cover')
}

// Plain text of the resume JSON, for "see the whole thing" and for copying.
function plain(r) {
  const c = r.candidate || {}
  const out = [c.full_name, c.generic_job_title, [c.location, c.phone, c.email, c.linkedin].filter(Boolean).join(' | ')].filter(Boolean)
  const sec = (t, lines) => { if (lines.length) out.push('', t.toUpperCase(), ...lines) }
  sec('Professional summary', r.professional_summary ? [r.professional_summary] : [])
  sec('Key skills', (r.key_skills || []).map(s => `• ${s}`))
  sec('Professional experience', (r.professional_experience || []).flatMap(x => ['', [x.job_title, x.employer].filter(Boolean).join(', ') + (x.start_date ? ` (${[x.start_date, x.end_date].filter(Boolean).join(' to ')})` : ''), ...(x.scope_statement ? [x.scope_statement] : []), ...(x.achievements || []).map(a => `• ${a}`)]))
  sec('Education and training', (r.education_and_training || []).map(e => [e.qualification, e.institution, e.completion_date].filter(Boolean).join(', ')))
  sec('Certifications', (r.certifications || []).map(x => [x.certification_name, x.issuing_body, x.year_obtained].filter(Boolean).join(', ')))
  sec('Awards', (r.awards || []).map(a => [a.award_name, a.issuing_organisation, a.year].filter(Boolean).join(', ')))
  sec('Technical skills', (r.technical_skills || []).map(g => `${g.category ? g.category + ': ' : ''}${(g.skills || []).join(', ')}`))
  sec('Additional information', (r.additional_information || []).map(i => `${i.category ? i.category + ': ' : ''}${i.details}`))
  return out.join('\n').trim()
}

function tailorView(ctx, doc) {
  const t = doc.content.tailored
  const base = (L.docs || []).find(d => d.id === t.base_id)
  const match = t.match || [], changes = t.changes || []
  const missing = match.filter(m => m.status === 'missing').length, strong = match.filter(m => m.status === 'strong').length
  const thin = match.length > 0 && missing * 2 >= match.length
  const f = L.files[doc.id], building = !!L.files['busy:' + doc.id]
  const diff = (a, b) => h('div', { class: 'tl-diff' },
    a && h('div', { class: 'tl-before' }, h('span', { class: 'tl-tag' }, 'Before'), h('p', {}, a)),
    b && h('div', { class: 'tl-after' }, h('span', { class: 'tl-tag' }, 'After'), h('p', {}, b)))
  return h('div', { class: 'card tl-result', id: 'tl-result' },
    h('div', { class: 'row review-head' }, h('span', { class: 'label' }, doc.title),
      h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.tail = null; L.mode = 'tailor'; L.tailJob = ''; L.tailJobFile = ''; L.tailRole = ''; L.tailCo = ''; L.err = ''; ctx.render() } }, 'Tailor for another job')),
    h('p', { class: 'small muted' }, `Saved${base ? `, under “${base.title}”` : ''}. Your original resume is untouched.`),
    t.summary && h('p', { class: 'tl-sum' }, t.summary),

    h('div', { class: 'row doc-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', disabled: building, onclick: () => download(ctx, doc) }, building ? 'Building the Word file…' : f ? 'Download Word file' : 'Download Word file'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => toCover(ctx, doc) }, 'Write the cover letter for this job')),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),

    h('div', { class: 'tl-block' }, h('b', {}, 'What changed'),
      changes.length === 0 ? h('p', { class: 'small muted' }, 'Only small wording changes.')
        : h('div', { class: 'tl-changes' }, changes.map(c => h('details', { class: 'tl-change' },
          h('summary', {}, h('span', { class: 'tl-kind k-' + c.kind }, KIND_NAMES[c.kind] || c.kind), h('span', { class: 'tl-sec' }, SECTION_NAMES[c.section] || c.section), h('span', { class: 'tl-what' }, c.what)),
          (c.before || c.after) ? diff(c.before, c.after) : h('p', { class: 'small muted' }, 'No text to show for this one.'))))),

    h('div', { class: 'tl-block' }, h('b', {}, 'How you match the ad'),
      match.length === 0 ? h('p', { class: 'small muted' }, 'No requirements were picked out of this ad.')
        : [h('p', { class: 'small muted' }, `${strong} of ${match.length} clearly in your resume${missing ? `, ${missing} not there` : ''}. Gaps are named honestly: nothing was added to cover them.`),
          h('ul', { class: 'tl-match' }, match.map(m => { const [label, cls] = STATUS[m.status] || STATUS.missing; return h('li', {},
            h('div', { class: 'tl-req' }, h('span', {}, m.requirement), h('span', { class: 'st ' + cls }, label)),
            m.evidence && h('p', { class: 'small tl-ev' }, m.evidence),
            m.status !== 'strong' && m.note && h('p', { class: 'small muted' }, m.note)) }))]),
    thin && h('div', { class: 'tl-block tl-thin' },
      h('b', {}, 'Big gaps on this one.'),
      h('p', { class: 'small' }, 'A tailored resume can’t close gaps like these. If several ads keep showing the same ones, your direction may have moved, and a new resume or a session with the Compass is the better next step.'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { L.tail = null; L.mode = 'new'; ctx.render(); scrollTop() } }, 'Start a new resume'),
        h('button', { class: 'link-btn blue', type: 'button', onclick: () => ctx.go('tools', 'compass') }, 'Open the Compass'))),

    h('div', { class: 'row' },
      h('button', { class: 'link-btn blue', type: 'button', onclick: () => openSaved(ctx, doc) }, 'Change something'),
      h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.showAll = !L.showAll; ctx.render() } }, L.showAll ? 'Hide the full resume' : 'See the full tailored resume')),
    L.showAll && h('div', {}, h('pre', { class: 'ra-draft' }, plain(doc.content.resume)),
      h('button', { class: 'link-btn blue', type: 'button', onclick: e => copyText(plain(doc.content.resume), e.currentTarget) }, 'Copy text')))
}

function message(m) {
  if (m.role === 'user') return h('div', { class: 'ra-msg ra-user' }, m.text)
  if (m.kind === 'draft') {
    return h('div', { class: 'ra-msg' },
      h('span', { class: 'label' }, 'Draft resume'),
      h('pre', { class: 'ra-draft' }, m.text),
      m.notes?.length > 0 && h('div', { class: 'ra-notes' }, h('b', {}, 'To confirm (proposed wording, not yet verified):'), h('ul', {}, m.notes.map(n => h('li', {}, n)))),
      h('div', { class: 'row' }, h('button', { class: 'link-btn blue', type: 'button', onclick: e => copyText(m.text, e.currentTarget) }, 'Copy text')),
      h('p', { class: 'ra-prompt' }, m.prompt))
  }
  if (m.kind === 'questions') return h('div', { class: 'ra-msg' }, h('p', {}, m.text), h('ol', {}, m.questions.map(q => h('li', {}, q))))
  if (m.kind === 'json') {
    return h('div', { class: 'ra-msg' }, h('span', { class: 'label' }, m.heading), h('pre', { class: 'ra-json' }, m.json),
      h('div', { class: 'row' }, h('button', { class: 'link-btn blue', type: 'button', onclick: e => copyText(m.json, e.currentTarget) }, 'Copy JSON')))
  }
  if (m.kind === 'result') {
    const checks = m.validation?.checks || []
    return h('div', { class: 'ra-msg ' + (m.ok ? 'ra-ok' : 'ra-fail') },
      h('p', { class: 'ra-prompt' }, m.message),
      m.ok && h('div', { class: 'row doc-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => saveB64(m.filename, m.docx, DOCX_TYPE) }, 'Download Word file')),
      !m.ok && h('p', { class: 'small' }, 'Reply “Try again” and the script will be corrected and run again.'),
      checks.length > 0 && h('details', {}, h('summary', {}, `Checks on the Word file: ${checks.filter(c => c.ok).length} of ${checks.length} passed`),
        h('ul', { class: 'ra-checks' }, checks.map(c => h('li', { class: c.ok ? 'ok' : 'bad' }, `${c.ok ? '✓' : '✗'} ${c.name}${!c.ok && c.detail ? ': ' + c.detail : ''}`))),
        h('p', { class: 'small muted' }, m.visual?.performed ? `Visual check: ${m.visual.pages} page(s)${m.visual.problems.length ? '. ' + m.visual.problems.join(' ') : ', no blank pages.'}` : (m.visual?.reason || ''))))
  }
  return h('div', { class: 'ra-msg' }, h('p', {}, m.text))
}

const fileBtn = (input, id, label) => h('label', { for: id, class: 'btn btn-secondary', role: 'button', tabindex: '0', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click() } } }, label)

function newForm(ctx) {
  const fileInput = h('input', { type: 'file', id: 'res-file', class: 'sr-only', onchange: e => { upload(ctx, e.target.files[0], 'cv'); e.target.value = '' } })
  const jdInput = h('input', { type: 'file', id: 'res-jd-file', class: 'sr-only', onchange: e => { upload(ctx, e.target.files[0], 'job'); e.target.value = '' } })
  return h('form', { class: 'card doc-form', novalidate: true, onsubmit: e => { e.preventDefault(); start(ctx) } },
    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '1'), h('div', {}, h('b', {}, 'Your current resume'), h('p', { class: 'small muted' }, 'A Word or PDF file, or paste the text. LinkedIn text, certificates and career notes help too. We keep it so you only do this once.'))),
    h('div', { class: 'row' }, fileInput, fileBtn(fileInput, 'res-file', L.uploading === 'cv' ? 'Reading your file…' : L.text ? 'Upload a different file' : 'Upload your resume'),
      !L.pasteOpen && h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.pasteOpen = true; ctx.render() } }, L.text ? 'View or edit the text' : 'Or paste it')),
    L.fileName && h('p', { class: 'small' }, `Loaded ${L.fileName}. Check the text below, since PDFs can come out a little jumbled.`),
    (L.pasteOpen || L.text) && h('div', { class: 'field' }, h('label', { for: 'res-text', class: 'sr-only' }, 'Your resume text'),
      h('textarea', { id: 'res-text', rows: '9', maxlength: '40000', placeholder: 'Roles, employers, dates, what you achieved, qualifications…', oninput: e => { L.text = e.target.value } }, L.text)),

    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '2'), h('div', {}, h('b', {}, 'The job you’re aiming at'), h('p', { class: 'small muted' }, 'Upload the job ad or position description (PDF or Word), or paste it. Leave it blank for a strong general resume.'))),
    h('div', { class: 'row' }, jdInput, fileBtn(jdInput, 'res-jd-file', L.uploading === 'job' ? 'Reading the job ad…' : L.jobFile ? 'Upload a different job ad' : 'Upload the job ad (PDF)')),
    L.jobFile && h('p', { class: 'small' }, `Loaded ${L.jobFile}.`),
    h('div', { class: 'field' }, h('label', { for: 'res-job', class: 'sr-only' }, 'Job ad'),
      h('textarea', { id: 'res-job', rows: '6', maxlength: '20000', placeholder: 'Or paste the job ad here', oninput: e => { L.job = e.target.value } }, L.job)),
    h('div', { class: 'field' }, h('label', { for: 'res-role' }, 'Job title to put under your name (optional)'),
      h('input', { id: 'res-role', type: 'text', maxlength: '200', placeholder: 'e.g. Operations Manager', value: L.role, oninput: e => { L.role = e.target.value } })),
    h('div', { class: 'field' }, h('label', { for: 'res-extra' }, 'Anything else to include? (optional)'),
      h('textarea', { id: 'res-extra', rows: '3', maxlength: '6000', placeholder: 'e.g. work rights, a licence, a project not on your old resume', oninput: e => { L.extra = e.target.value } }, L.extra)),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: !!L.busy || !!L.uploading }, L.busy || 'Draft my resume'),
    h('p', { class: 'small muted' }, 'You’ll see the full draft first. Once you approve it, the Word file is made and checked straight away.'))
}

function tailorForm(ctx) {
  const list = bases()
  const jdInput = h('input', { type: 'file', id: 'tl-jd-file', class: 'sr-only', onchange: e => { upload(ctx, e.target.files[0], 'tailjob'); e.target.value = '' } })
  return h('form', { class: 'card doc-form', novalidate: true, onsubmit: e => { e.preventDefault(); tailor(ctx) } },
    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '1'), h('div', {}, h('b', {}, 'The resume to tailor'),
      h('p', { class: 'small muted' }, 'It stays as it is. The tailored version is saved separately, under it.'))),
    list.length === 1
      ? h('p', { class: 'small' }, `${list[0].title} · ${when(list[0].created_at)}`)
      : h('div', { class: 'field' }, h('label', { for: 'tl-base', class: 'sr-only' }, 'Resume to tailor'),
        h('select', { id: 'tl-base', onchange: e => { L.baseId = e.target.value } }, list.map(d => h('option', { value: d.id, ...(d.id === L.baseId ? { selected: '' } : {}) }, `${d.title} · ${when(d.created_at)}`)))),
    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '2'), h('div', {}, h('b', {}, 'The job ad'), h('p', { class: 'small muted' }, 'Paste the whole thing, including what they require, or upload it.'))),
    h('div', { class: 'row' }, jdInput, fileBtn(jdInput, 'tl-jd-file', L.uploading === 'tailjob' ? 'Reading the job ad…' : L.tailJobFile ? 'Upload a different job ad' : 'Upload the job ad (PDF)')),
    L.tailJobFile && h('p', { class: 'small' }, `Loaded ${L.tailJobFile}.`),
    h('div', { class: 'field' }, h('label', { for: 'tl-job', class: 'sr-only' }, 'Job ad'),
      h('textarea', { id: 'tl-job', rows: '8', maxlength: '20000', placeholder: 'Or paste the job ad here', oninput: e => { L.tailJob = e.target.value } }, L.tailJob)),
    h('div', { class: 'two' },
      h('div', { class: 'field' }, h('label', { for: 'tl-role' }, 'Role'), h('input', { id: 'tl-role', type: 'text', maxlength: '120', placeholder: 'e.g. Operations Coordinator', value: L.tailRole, oninput: e => { L.tailRole = e.target.value } })),
      h('div', { class: 'field' }, h('label', { for: 'tl-co' }, 'Organisation'), h('input', { id: 'tl-co', type: 'text', maxlength: '120', value: L.tailCo, oninput: e => { L.tailCo = e.target.value } }))),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: !!L.busy || !!L.uploading }, L.busy || 'Tailor my resume'),
    h('p', { class: 'small muted' }, 'Your summary is rewritten for this role, the most relevant work leads, and the ad’s words are used where you have the thing. Employers, titles, dates and figures stay exactly as they are. Nothing is added that you haven’t done. You’ll see every change, and how you match the ad.'))
}

// The two paths, with a line on when each is the right one.
function pathPicker(ctx) {
  const opt = (mode, title, hint) => h('button', { class: 'path' + (L.mode === mode ? ' on' : ''), type: 'button', 'aria-pressed': L.mode === mode ? 'true' : 'false', onclick: () => { L.mode = mode; L.err = ''; ctx.render() } }, h('b', {}, title), h('span', { class: 'small' }, hint))
  return h('div', { class: 'path-cards' },
    opt('tailor', 'Tailor for a job', 'Keeps your resume as it is and adjusts it for one ad. About a minute.'),
    opt('new', 'Write a new resume', 'Start from scratch, or rebuild it if your direction has changed.'))
}

function savedList(ctx) {
  const all = (L.docs || []).filter(d => d.kind === 'resume')
  if (!all.length) return null
  const tailored = all.filter(isTailored)
  const roots = all.filter(d => !isTailored(d))
  const orphans = tailored.filter(t => !roots.some(r => r.id === t.content.tailored.base_id))
  const del = d => h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${d.title}`, onclick: async () => {
    try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: d.id }); L.docs = L.docs.filter(x => x.id !== d.id); if (L.docId === d.id) L.docId = null; if (L.tail?.id === d.id) L.tail = null; if (L.baseId === d.id) L.baseId = bases()[0]?.id || '' } catch (e) { L.err = e.message }
    ctx.render()
  } }, '×')
  const tailRow = t => h('div', { class: 'mem sub' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.tail = t; L.conv = null; L.showAll = false; L.err = ''; ctx.render(); scrollTop() } }, `${t.title} · ${when(t.created_at)}`), del(t))
  return h('div', { class: 'card' }, h('span', { class: 'label' }, 'Saved resumes'),
    h('p', { class: 'small muted' }, 'Open one to change it or make the Word file again. Tailored versions sit under the resume they came from.'),
    roots.map(r => h('div', { class: 'mem-group' },
      h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => openSaved(ctx, r) }, `${r.title} · ${when(r.created_at)}`),
        isBuilt(r) && h('button', { class: 'link-btn blue small', type: 'button', onclick: () => { L.baseId = r.id; L.mode = 'tailor'; L.tail = null; L.conv = null; L.err = ''; ctx.render(); scrollTop(); document.getElementById('tl-job')?.focus() } }, 'Tailor for a job'), del(r)),
      tailored.filter(t => t.content.tailored.base_id === r.id).map(tailRow))),
    orphans.length > 0 && h('div', { class: 'mem-group' }, h('span', { class: 'small muted' }, 'Tailored versions'), orphans.map(tailRow)))
}

export function resumeScreen(ctx) {
  load(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, 'Resume writer'),
    h('p', { class: 'muted' }, 'An Australian-standard, ATS-friendly resume from your own work history, matched to the job you want. You check and approve every word before the Word file is made. Nothing is invented.'))
  if (L.text === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const c = L.conv
  const conv = c && h('div', { class: 'card ra-conv' },
    h('div', { class: 'row' }, h('span', { class: 'label' }, 'Your resume'), h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.conv = null; L.err = ''; ctx.render() } }, c.state === 'DRAFTING' ? 'Start again' : 'Back to the writer')),
    c.messages.map(message),
    L.busy && h('p', { class: 'loading small', 'aria-live': 'polite' }, L.busy),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('form', { class: 'ra-reply', onsubmit: e => { e.preventDefault(); send(ctx) } },
      QUICK[c.state] && h('button', { class: 'btn btn-primary', type: 'button', disabled: !!L.busy, onclick: () => send(ctx, QUICK[c.state]) }, QUICK[c.state]),
      h('label', { for: 'ra-reply', class: 'sr-only' }, 'Your reply'),
      h('textarea', { id: 'ra-reply', rows: '2', maxlength: '6000', disabled: !!L.busy, placeholder: c.state === 'DRAFTING' ? 'Answer the questions here' : 'Your reply, or the changes you want', oninput: e => { L.reply = e.target.value }, onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ctx) } } }, L.reply),
      h('button', { class: 'btn btn-secondary', type: 'submit', disabled: !!L.busy }, 'Send')),
    h('div', { id: 'ra-end' }))

  const saved = savedList(ctx)
  if (c) return h('section', { class: 'screen docs' }, head, h('div', {}, conv, saved))
  if (L.tail) return h('section', { class: 'screen docs' }, head, h('div', { class: 'docs-cols' }, h('div', {}, tailorView(ctx, L.tail)), h('div', {}, saved)))
  const canTailor = bases().length > 0
  const form = h('div', {}, canTailor && pathPicker(ctx), L.mode === 'tailor' && canTailor ? tailorForm(ctx) : newForm(ctx))
  return h('section', { class: 'screen docs' }, head, h('div', { class: 'docs-cols' }, h('div', {}, form), h('div', {}, saved || h('div', { class: 'docs-empty muted small' }, 'Your saved resumes appear here.'))))
}
