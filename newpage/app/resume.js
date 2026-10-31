// Resume writer: the four-phase Australian resume agent (api/newpage/resume.py).
// 1. Upload or paste your resume (and the job ad, as a PDF if you like).
// 2. Read the full draft, ask for changes, approve it. This is the only approval.
// 3. The approved resume is shown as JSON ("Phase 2, Prepare"), then straight away
// 4. the Python script is generated, run and checked, and the Word file is yours.
// The gates live on the server; this screen shows the conversation.
import { h, copyText } from './ui.js'
import { saveB64, DOCX_TYPE, fileToB64 } from './docfiles.js'

const API = '/api/newpage/resume'
const QUICK = { AWAITING_CONTENT_APPROVAL: 'Yes', EXECUTION_FAILED: 'Try again' }
// Replies that approve the content, which also builds the Word file (for the busy message only).
const APPROVAL = /^(y|yes|yep|yeah|approved?|looks good|proceed|go ahead|content approved|perfect|lgtm|try again|retry)\b/i
const L = { text: null, fileName: '', job: '', jobFile: '', role: '', extra: '', uploading: '', busy: '', err: '', note: '', conv: null, docs: null, docId: null, loading: false, reply: '', pasteOpen: false }

async function load(ctx) {
  if (L.text !== null || L.loading) return
  L.loading = true
  try {
    const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
    L.text = p.data.text || ''
    L.docs = d.docs
  } catch (e) { L.text = ''; L.docs = []; L.err = e.message }
  L.loading = false
  ctx.render()
}

const agent = (ctx, body) => ctx.call(API, { token: ctx.token(), ...body })

async function upload(ctx, file, into) {
  if (!file) return
  if (file.size > 3 * 1024 * 1024) { L.err = 'That file is over 3 MB. Try a smaller one, or paste the text.'; ctx.render(); return }
  L.uploading = into; L.err = ''; ctx.render()
  try {
    const d = await agent(ctx, { action: 'extract', filename: file.name, file: await fileToB64(file) })
    if (into === 'job') { L.job = d.text; L.jobFile = file.name } else { L.text = d.text; L.fileName = file.name; L.pasteOpen = true }
  } catch (e) { L.err = e.message }
  L.uploading = ''; ctx.render()
}

const errText = e => (e.code === 'coach_off' ? 'The resume writer isn’t switched on yet.' : e.message)

function scrollToEnd() { requestAnimationFrame(() => document.getElementById('ra-end')?.scrollIntoView({ block: 'end', behavior: 'smooth' })) }

async function start(ctx) {
  if (L.busy) return
  if ((L.text || '').trim().length < 80) { L.err = 'Add your current resume first: upload it, or paste your roles, dates and what you achieved.'; ctx.render(); return }
  L.busy = 'Drafting your resume. This can take up to a minute.'; L.err = ''; ctx.render()
  ctx.call('/api/newpage/app', { action: 'tool_save', tool: 'profile', data: { text: L.text } }).catch(() => {})
  try {
    const d = await agent(ctx, { action: 'start', materials: L.text, job_description: L.job, target_title: L.role, additional: L.extra })
    L.conv = { session: d.session, state: d.state, resume: d.resume, messages: d.messages.map(m => ({ role: 'agent', ...m })) }
    L.docId = null
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
        const s = await ctx.call('/api/newpage/app', { action: 'resume_save', id: L.docId, resume: d.resume, filename: done.filename, target_title: L.role, job_description: L.job })
        L.docId = s.doc.id || L.docId
        L.docs = [s.doc, ...(L.docs || []).filter(x => x.id !== s.doc.id)]
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
    L.docId = doc.id; L.role = content.target_title || ''; L.job = content.job_description || ''
  } catch (e) { L.err = errText(e) }
  L.busy = ''; ctx.render(); scrollToEnd()
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

export function resumeScreen(ctx) {
  load(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, 'Resume writer'),
    h('p', { class: 'muted' }, 'An Australian-standard, ATS-friendly resume from your own work history, matched to the job you want. You check and approve every word before the Word file is made. Nothing is invented.'))
  if (L.text === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const fileInput = h('input', { type: 'file', id: 'res-file', accept: '.docx,.pdf,.txt,.md', class: 'sr-only', onchange: e => { upload(ctx, e.target.files[0], 'cv'); e.target.value = '' } })
  const jdInput = h('input', { type: 'file', id: 'res-jd-file', accept: '.pdf,.docx,.txt,.md', class: 'sr-only', onchange: e => { upload(ctx, e.target.files[0], 'job'); e.target.value = '' } })
  const fileBtn = (input, id, label) => h('label', { for: id, class: 'btn btn-secondary', role: 'button', tabindex: '0', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click() } } }, label)

  const form = !L.conv && h('form', { class: 'card doc-form', novalidate: true, onsubmit: e => { e.preventDefault(); start(ctx) } },
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

  const c = L.conv
  const conv = c && h('div', { class: 'card ra-conv' },
    h('div', { class: 'row' }, h('span', { class: 'label' }, 'Your resume'), h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.conv = null; L.err = ''; ctx.render() } }, 'Start a new resume')),
    c.messages.map(message),
    L.busy && h('p', { class: 'loading small', 'aria-live': 'polite' }, L.busy),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('form', { class: 'ra-reply', onsubmit: e => { e.preventDefault(); send(ctx) } },
      QUICK[c.state] && h('button', { class: 'btn btn-primary', type: 'button', disabled: !!L.busy, onclick: () => send(ctx, QUICK[c.state]) }, QUICK[c.state]),
      h('label', { for: 'ra-reply', class: 'sr-only' }, 'Your reply'),
      h('textarea', { id: 'ra-reply', rows: '2', maxlength: '6000', disabled: !!L.busy, placeholder: c.state === 'DRAFTING' ? 'Answer the questions here' : 'Your reply, or the changes you want', oninput: e => { L.reply = e.target.value }, onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ctx) } } }, L.reply),
      h('button', { class: 'btn btn-secondary', type: 'submit', disabled: !!L.busy }, 'Send')),
    h('div', { id: 'ra-end' }))

  const mine = (L.docs || []).filter(d => d.kind === 'resume')
  const saved = mine.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Saved resumes'),
    h('p', { class: 'small muted' }, 'Open one to change it or make the Word file again.'),
    mine.map(d => h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => openSaved(ctx, d) }, `${d.title} · ${new Date(d.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${d.title}`, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: d.id }); L.docs = L.docs.filter(x => x.id !== d.id); if (L.docId === d.id) L.docId = null } catch (e) { L.err = e.message } ctx.render() } }, '×'))))

  return h('section', { class: 'screen docs' }, head, c ? h('div', {}, conv, saved) : h('div', { class: 'docs-cols' }, h('div', {}, form), h('div', {}, saved || h('div', { class: 'docs-empty muted small' }, 'Your saved resumes appear here.'))))
}
