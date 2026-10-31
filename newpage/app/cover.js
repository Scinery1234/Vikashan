// Cover letter writer, in three steps. Step 1: your resume and the job ad. The ad is
// read on its own for the competencies the employer will assess; then your resume
// is checked against that list for gaps. Step 2: one pointed question per
// competency, built from those gaps, answered with real examples. Step 3: about
// you. The letter is written from that evidence only, in Australian format.
import { h, copyText } from './ui.js'
import { templatePicker, pagePreview, saveB64, DOCX_TYPE, safeName, fileToB64 } from './docfiles.js'

const L = {
  step: 1, job: '', role: '', company: '', themes: [], reqs: [], ev: {}, openKw: 0, addKw: '',
  name: '', currentTitle: '', years: '', why: '', unique: '', phone: '', location: '', linkedin: '', template: 'modern',
  resume: '', resumeFile: '', savedResume: null, profileText: '', pasteOpen: false, uploading: false,
  busy: false, analysing: '', err: '', cur: null, files: {}, docs: null, loading: false, draft: null, saving: false, note: '', review: null, reviewing: false
}

export const coverText = c => [c.greeting, '', ...c.paragraphs.flatMap(p => [p, '']), c.closing, '', c.signoff].join('\n').trim()

const contactOf = r => (r.content.resume?.candidate ? { name: r.content.resume.candidate.full_name, phone: r.content.resume.candidate.phone, location: r.content.resume.candidate.location, linkedin: r.content.resume.candidate.linkedin, title: r.content.resume.candidate.generic_job_title }
  : { name: r.content.name, phone: r.content.contact?.phone, location: r.content.contact?.location, linkedin: r.content.contact?.linkedin, title: r.content.experience?.[0]?.title })

async function load(ctx) {
  if (L.docs !== null || L.loading) return
  L.loading = true
  try {
    const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
    L.docs = d.docs
    L.profileText = p.data.text || ''
    const r = d.docs.find(x => x.kind === 'resume')
    L.savedResume = r || null
    if (r) {
      const c = contactOf(r)
      L.name = L.name || c.name || ''
      L.phone = L.phone || c.phone || ''
      L.location = L.location || c.location || ''
      L.linkedin = L.linkedin || c.linkedin || ''
      L.template = r.content.template || L.template
      L.currentTitle = L.currentTitle || c.title || ''
    }
    const c = d.docs.find(x => x.kind === 'cover')
    if (c && !L.cur) L.cur = c
  } catch (e) { L.docs = []; L.err = e.message }
  L.loading = false
  ctx.render()
}

// The resume we read the ad against: what you add here, else the one approved in the Resume writer, else the text saved there.
const ownResume = () => L.resume.trim().length >= 80
const hasResume = () => ownResume() || !!L.savedResume || L.profileText.trim().length >= 80
function resumeSource() {
  if (ownResume()) return L.resumeFile ? `Using ${L.resumeFile}.` : 'Using the resume you pasted.'
  if (L.savedResume) return `Using "${L.savedResume.title}", made in the Resume writer on ${new Date(L.savedResume.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}.`
  if (L.profileText.trim().length >= 80) return 'Using the resume text you uploaded earlier.'
  return ''
}

async function upload(ctx, file) {
  if (!file) return
  if (file.size > 3 * 1024 * 1024) { L.err = 'That file is over 3 MB. Try a smaller one, or paste the text.'; ctx.render(); return }
  L.uploading = true; L.err = ''; ctx.render()
  try {
    const d = await ctx.call('/api/newpage/docx', { token: ctx.token(), action: 'extract', filename: file.name, file: await fileToB64(file) })
    L.resume = d.text; L.resumeFile = file.name; L.pasteOpen = true
  } catch (e) { L.err = e.message }
  L.uploading = false; ctx.render()
}

const key = d => d && d.id + ':' + (d.content.template || 'modern') + ':' + JSON.stringify(d.content).length
async function ensureFiles(ctx) {
  const d = L.cur, k = key(d)
  if (!d || L.files[k] || L.files['busy:' + k]) return
  L.files['busy:' + k] = true
  try { L.files[k] = await ctx.call('/api/newpage/docx', { token: ctx.token(), action: 'cover', data: d.content, template: d.content.template || 'modern' }) } catch (e) { L.err = e.message }
  delete L.files['busy:' + k]
  ctx.render()
}

// A recruiter's read of the finished letter: score, what works, what weakens the case,
// and the questions whose answers would fix it. The answers go into step 2.
function reviewCard(ctx, cur) {
  const r = L.review && L.review.id === cur.id ? L.review.data : null
  const run = async () => {
    if (L.reviewing) return
    L.reviewing = true; L.err = ''; ctx.render()
    try {
      const evidence = L.themes.map(t => ({ keyword: t.keyword, ...(L.ev[t.keyword] || {}) }))
      const d = await ctx.call('/api/newpage/app', { action: 'cover_review', id: cur.id, job: L.job, keywords: L.themes.map(t => t.keyword), evidence, resume: ownResume() ? L.resume : '' })
      L.review = { id: cur.id, data: d.review }
    } catch (e) { L.err = e.code === 'coach_off' ? 'The writer isn’t switched on yet.' : e.message }
    L.reviewing = false; ctx.render()
    document.getElementById('cv-review')?.scrollIntoView({ block: 'nearest' })
  }
  const btn = h('button', { class: 'btn btn-secondary', type: 'button', disabled: L.reviewing, onclick: run }, L.reviewing ? 'Reading it as a recruiter…' : r ? 'Review it again' : 'Review this letter')
  if (!r) return h('div', { class: 'field' }, btn, h('p', { class: 'small muted' }, 'A recruiter’s read: does this letter make your case, and what would make it stronger.'))
  return h('div', { id: 'cv-review', class: 'review' },
    h('div', { class: 'row review-head' }, h('span', { class: 'label' }, 'Recruiter’s read'), r.score != null && h('span', { class: 'score' }, `${r.score} / 10`)),
    r.verdict && h('p', {}, r.verdict),
    r.strengths.length > 0 && h('div', {}, h('b', {}, 'What works'), h('ul', {}, r.strengths.map(x => h('li', {}, x)))),
    r.issues.length > 0 && h('div', {}, h('b', {}, 'What weakens the case'), h('ul', {}, r.issues.map(i => h('li', {}, i.paragraph > 0 && h('span', { class: 'para' }, `Paragraph ${i.paragraph}. `), i.problem, i.fix && h('span', { class: 'fix' }, ' ' + i.fix))))),
    r.questions.length > 0 && h('div', {}, h('b', {}, 'Questions that would strengthen it'), h('ul', {}, r.questions.map(q => h('li', {}, q.keyword && h('b', {}, q.keyword + ': '), q.question))),
      h('p', { class: 'small muted' }, 'Answer these in step 2, then write the letter again. Or fix the words below by hand.'),
      L.themes.length > 0 && h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.step = 2; ctx.render(); document.querySelector('.doc-form')?.scrollIntoView({ block: 'start' }) } }, 'Back to step 2')),
    btn)
}

const steps = ['Resume and job', 'Your proof', 'About you']
const stepper = () => h('ol', { class: 'stepper', 'aria-label': 'Steps' }, steps.map((s, i) => h('li', { class: i + 1 === L.step ? 'on' : i + 1 < L.step ? 'past' : '', ...(i + 1 === L.step ? { 'aria-current': 'step' } : {}) }, h('span', {}, i + 1), s)))

const STATUS = { strong: ['In your resume', 'ok'], partial: ['Thin in your resume', 'part'], missing: ['Not in your resume', 'gap'], added: ['You added this', 'part'] }

export function coverScreen(ctx) {
  load(ctx)
  ensureFiles(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, 'Cover letter writer'),
    h('p', { class: 'muted' }, 'A strong letter is built on proof. We read the job ad for the competencies the employer will assess, check your resume against them for gaps, then ask you pointed questions about what you have actually done. The letter is written from your answers, in Australian format.'))
  if (L.docs === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const errText = e => (e.code === 'coach_off' ? 'The writer isn’t switched on yet.' : e.message)

  // Pass 1 reads the ad alone; pass 2 checks the resume against what it found.
  const analyse = async () => {
    if (L.analysing) return
    L.err = ''
    if (!hasResume()) { L.err = 'Add your resume first. The questions on the next step are built from it.'; ctx.render(); return }
    if (L.job.trim().length < 60) { L.err = 'Paste the whole job ad.'; ctx.render(); return }
    const resume = ownResume() ? L.resume : ''
    if (resume) ctx.call('/api/newpage/app', { action: 'tool_save', tool: 'profile', data: { text: resume } }).catch(() => {})
    L.analysing = 'Reading the ad for what the employer will assess…'; ctx.render()
    try {
      const a = await ctx.call('/api/newpage/app', { action: 'cover_analyse', job: L.job })
      L.analysing = 'Checking your resume against it…'; ctx.render()
      const g = await ctx.call('/api/newpage/app', { action: 'cover_gaps', themes: a.themes, resume })
      L.themes = g.themes; L.reqs = a.requirements; L.ev = {}; L.openKw = 0; L.step = 2
    } catch (e) { L.err = errText(e) }
    L.analysing = ''; ctx.render()
  }

  const generate = async () => {
    if (L.busy) return
    L.busy = true; L.err = ''; ctx.render()
    try {
      const evidence = L.themes.map(t => ({ keyword: t.keyword, resume: t.resume, ...(L.ev[t.keyword] || {}) }))
      const d = await ctx.call('/api/newpage/app', {
        action: 'doc_generate', kind: 'cover', job: L.job, role: L.role, company: L.company, keywords: L.themes.map(t => t.keyword), requirements: L.reqs, evidence,
        name: L.name, currentTitle: L.currentTitle, years: L.years, why: L.why, unique: L.unique, resume: ownResume() ? L.resume : '', template: L.template,
        contact: { phone: L.phone, location: L.location, linkedin: L.linkedin }
      })
      L.cur = d.doc; L.docs = [d.doc, ...L.docs.filter(x => x.id !== d.doc.id)]; L.draft = null; L.review = null
    } catch (e) { L.err = errText(e) }
    L.busy = false; ctx.render()
    if (L.cur && !L.err) document.getElementById('doc-result')?.scrollIntoView({ block: 'start' })
  }

  const inp = (id, label, prop, attrs = {}) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, type: 'text', maxlength: '160', value: L[prop], oninput: e => { L[prop] = e.target.value }, ...attrs }))
  const area = (id, label, prop, rows, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), hint && h('p', { class: 'small muted' }, hint), h('textarea', { id, rows: String(rows), maxlength: '2000', oninput: e => { L[prop] = e.target.value } }, L[prop]))

  let body
  if (L.step === 1) {
    const fileInput = h('input', { type: 'file', id: 'cv-file', accept: '.docx,.pdf,.txt,.md', class: 'sr-only', onchange: e => { upload(ctx, e.target.files[0]); e.target.value = '' } })
    const src = resumeSource()
    body = [
      h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '1'), h('div', {}, h('b', {}, 'Your resume'), h('p', { class: 'small muted' }, 'This comes first. We check it against the job ad, and the questions on the next step come from where it is strong, thin or silent.'))),
      src && h('p', { class: 'small' }, src),
      h('div', { class: 'row' }, fileInput,
        h('label', { for: 'cv-file', class: 'btn btn-secondary', role: 'button', tabindex: '0', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click() } } }, L.uploading ? 'Reading your file…' : src ? 'Use a different file' : 'Upload your resume'),
        !L.pasteOpen && h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.pasteOpen = true; ctx.render() } }, src ? 'Or paste a different one' : 'Or paste it'),
        !L.savedResume && h('button', { class: 'link-btn blue', type: 'button', onclick: () => ctx.go('tools', 'resume') }, 'Write one in the Resume writer')),
      L.pasteOpen && h('div', { class: 'field' }, h('label', { for: 'cv-res', class: 'sr-only' }, 'Your resume text'),
        h('textarea', { id: 'cv-res', rows: '8', maxlength: '20000', placeholder: 'Roles, employers, dates, what you achieved, qualifications…', oninput: e => { L.resume = e.target.value; L.resumeFile = '' } }, L.resume)),
      h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '2'), h('div', {}, h('b', {}, 'The job ad'), h('p', { class: 'small muted' }, 'Paste the whole thing, including what they require.'))),
      h('div', { class: 'field' }, h('label', { for: 'cv-job', class: 'sr-only' }, 'The job ad'), h('textarea', { id: 'cv-job', rows: '9', maxlength: '12000', oninput: e => { L.job = e.target.value } }, L.job)),
      h('div', { class: 'two' }, inp('cv-role', 'Role', 'role', { placeholder: 'e.g. Operations Coordinator' }), inp('cv-co', 'Organisation', 'company')),
      L.err && h('p', { class: 'error', role: 'alert' }, L.err),
      h('button', { class: 'btn btn-primary', type: 'button', disabled: !!L.analysing || L.uploading, onclick: analyse }, L.analysing || 'Read the ad and check my resume'),
      L.analysing && h('p', { class: 'small muted', 'aria-live': 'polite' }, 'Two passes: the ad on its own first, then your resume against it.')
    ]
  } else if (L.step === 2) {
    const missing = L.themes.filter(t => t.status === 'missing').length
    body = [
      h('p', {}, 'These are the competencies the employer will assess, most important first. Where your resume touches on one, we quote it, but that is often not your best example. For each one, think about the time you demonstrated it most clearly, in any role, paid or unpaid: your part in it, not the team’s, how big it was, and what changed because of you. Answer the ones you can. Leave the rest blank, and never guess a number.'),
      missing > 0 && h('p', { class: 'small muted' }, `${missing} of ${L.themes.length} are not in your resume. Those are where an honest example matters most, or where it is fine to say nothing.`),
      L.reqs.length > 0 && h('details', { class: 'reqs' }, h('summary', {}, `What the ad asks for (${L.reqs.length})`), h('ul', {}, L.reqs.map(r => h('li', {}, r)))),
      h('div', { class: 'kw-list' }, L.themes.map((t, i) => {
        const e = L.ev[t.keyword] || (L.ev[t.keyword] = { situation: '', result: '', award: '' })
        const done = !!(e.situation || e.result || e.award)
        const [label, cls] = done ? ['Added', 'ok'] : STATUS[t.status] || STATUS.missing
        return h('details', { class: 'kw', open: i === L.openKw ? '' : null },
          h('summary', {}, h('b', {}, t.keyword), h('span', { class: 'st ' + cls }, label)),
          t.wants && h('p', { class: 'small muted' }, h('b', {}, 'What they want: '), t.wants),
          h('p', { class: 'small' }, h('b', {}, t.resume ? 'One example in your resume: ' : 'Your resume: '), t.resume || 'Nothing on this yet.'),
          t.question && h('p', { class: 'ask' }, t.question),
          h('div', { class: 'field' }, h('label', { for: `ev-s-${i}` }, t.resume ? 'Your best example of this, from any role: that one or a stronger one' : 'Your example: when, where, and what you did'), h('textarea', { id: `ev-s-${i}`, rows: '3', maxlength: '600', oninput: ev => { e.situation = ev.target.value; const s = ev.target.closest('details').querySelector('summary .st'); s.textContent = 'Added'; s.className = 'st ok' } }, e.situation)),
          h('div', { class: 'field' }, h('label', { for: `ev-r-${i}` }, 'The result (a number, %, $, time saved)'), h('input', { id: `ev-r-${i}`, type: 'text', maxlength: '400', value: e.result, oninput: ev => { e.result = ev.target.value } })),
          h('div', { class: 'field' }, h('label', { for: `ev-a-${i}` }, 'Praise, award or promotion (optional)'), h('input', { id: `ev-a-${i}`, type: 'text', maxlength: '300', value: e.award, oninput: ev => { e.award = ev.target.value } })),
          h('button', { class: 'link-btn kw-drop', type: 'button', onclick: () => { L.themes = L.themes.filter(x => x !== t); delete L.ev[t.keyword]; ctx.render() } }, 'Not relevant to this letter'))
      })),
      h('div', { class: 'field' }, h('label', { for: 'cv-add' }, 'Something the ad asks for that we missed? Add it'),
        h('div', { class: 'row' }, h('input', { id: 'cv-add', type: 'text', maxlength: '60', value: L.addKw, placeholder: 'e.g. grant writing', oninput: e => { L.addKw = e.target.value } }),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => {
            const k = L.addKw.trim()
            if (!k || L.themes.some(t => t.keyword.toLowerCase() === k.toLowerCase())) return
            L.themes.push({ keyword: k, wants: '', resume: '', status: 'added', question: `When have you actually done this? Name the employer, your part in it, how big it was, and what the result was.` })
            L.addKw = ''; L.openKw = L.themes.length - 1; ctx.render()
          } }, 'Add'))),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { L.step = 1; ctx.render() } }, 'Back'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { L.step = 3; ctx.render() } }, 'Continue'))
    ]
  } else {
    body = [
      h('div', { class: 'two' }, inp('cv-name', 'Your name', 'name'), inp('cv-title', 'Your current job title', 'currentTitle')),
      h('div', { class: 'two' }, inp('cv-years', 'Years of experience', 'years', { maxlength: '20' }), inp('cv-loc', 'Suburb and state', 'location', { placeholder: 'e.g. Parramatta, NSW' })),
      h('div', { class: 'two' }, inp('cv-phone', 'Phone', 'phone', { maxlength: '40' }), inp('cv-li', 'LinkedIn (optional)', 'linkedin')),
      area('cv-why', 'Why do you want this role?', 'why', 4),
      area('cv-unique', 'What sets you apart from other applicants?', 'unique', 4),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Style (matches your resume)'), templatePicker(L.template, id => { L.template = id; ctx.render() })),
      L.err && h('p', { class: 'error', role: 'alert' }, L.err),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { L.step = 2; ctx.render() } }, 'Back'), h('button', { class: 'btn btn-primary', type: 'button', disabled: L.busy, onclick: generate }, L.busy ? 'Writing your letter… up to a minute' : 'Write my cover letter')),
      h('p', { class: 'small muted' }, 'Written by an AI from your resume and your examples. It’s told never to invent anything, but check every line before you send it.')
    ]
  }
  const form = h('div', { class: 'card doc-form' }, stepper(), body)

  const cur = L.cur
  const files = cur && L.files[key(cur)]
  const d = cur && (L.draft || (L.draft = { subject: cur.content.subject, greeting: cur.content.greeting, paragraphs: [...cur.content.paragraphs], closing: cur.content.closing, signoff: cur.content.signoff }))
  const fresh = cur && L.docs[0]?.id === cur.id && L.step === 1 && !L.themes.length
  const reset = () => { L.cur = null; L.draft = null; L.review = null; L.step = 1; L.themes = []; L.reqs = []; L.ev = {}; L.job = ''; L.role = ''; L.company = ''; L.err = ''; ctx.render(); document.querySelector('.doc-form')?.scrollIntoView({ block: 'start' }) }
  const result = cur && h('div', { id: 'doc-result', class: 'card doc-result' },
    h('div', { class: 'row review-head' }, h('span', { class: 'label' }, (fresh ? 'Your last letter: ' : '') + cur.title),
      h('button', { class: 'link-btn blue', type: 'button', onclick: reset }, 'Start a new letter')),
    fresh && h('p', { class: 'small muted' }, 'This is the letter you made last time. To write a new one, fill in the steps on the left, or start fresh.'),
    files ? pagePreview(files.html) : h('p', { class: 'loading small' }, 'Building the preview…'),
    h('div', { class: 'row doc-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', disabled: !files, onclick: () => saveB64(`${safeName(cur.title)}.docx`, files.docx, DOCX_TYPE) }, 'Download Word file'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(coverText(cur.content), e.currentTarget) }, 'Copy text')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Style'),
      templatePicker(cur.content.template || 'modern', async id => {
        try { const r = await ctx.call('/api/newpage/app', { action: 'doc_template', id: cur.id, template: id }); L.cur = r.doc; L.docs = L.docs.map(x => (x.id === r.doc.id ? r.doc : x)); L.template = id } catch (e) { L.err = e.message }
        ctx.render()
      })),
    reviewCard(ctx, cur),
    h('details', { class: 'edit-text' }, h('summary', {}, 'Edit the words'),
      h('div', { class: 'field' }, h('label', { for: 'ed-sub' }, 'Subject line'), h('input', { id: 'ed-sub', type: 'text', maxlength: '160', value: d.subject, oninput: e => { d.subject = e.target.value } })),
      d.paragraphs.map((p, i) => h('div', { class: 'field' }, h('label', { for: `ed-p${i}`, class: 'sr-only' }, `Paragraph ${i + 1}`), h('textarea', { id: `ed-p${i}`, rows: '5', maxlength: '1800', oninput: e => { d.paragraphs[i] = e.target.value } }, p))),
      h('button', { class: 'btn btn-secondary', type: 'button', disabled: L.saving, onclick: async () => {
        L.saving = true; L.err = ''; ctx.render()
        try { const r = await ctx.call('/api/newpage/app', { action: 'doc_save', id: cur.id, content: d }); L.cur = r.doc; L.docs = L.docs.map(x => (x.id === r.doc.id ? r.doc : x)); L.draft = null; L.note = 'Saved.' } catch (e) { L.err = e.message }
        L.saving = false; ctx.render()
      } }, L.saving ? 'Saving…' : 'Save my changes'), L.note && h('p', { class: 'small' }, L.note)))

  const mine = L.docs.filter(x => x.kind === 'cover' && (!cur || x.id !== cur.id))
  const saved = mine.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Saved letters'),
    mine.map(x => h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.cur = x; L.draft = null; L.review = null; ctx.render(); document.getElementById('doc-result')?.scrollIntoView({ block: 'start' }) } }, `${x.title} · ${new Date(x.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${x.title}`, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: x.id }); L.docs = L.docs.filter(y => y.id !== x.id); if (L.cur?.id === x.id) L.cur = null } catch (e) { L.err = e.message } ctx.render() } }, '×'))))

  return h('section', { class: 'screen docs' }, head, h('div', { class: 'docs-cols' }, h('div', {}, form), h('div', {}, result || h('div', { class: 'docs-empty muted small' }, 'Your letter appears here.'), saved)))
}
