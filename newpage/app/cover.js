// Cover letter writer, in three short steps: read the job ad, give real proof
// for what it asks for, then say why you want the role. The letter is written
// from that evidence only, in Australian business-letter format.
import { h, copyText } from './ui.js'
import { templatePicker, pagePreview, saveB64, DOCX_TYPE, safeName } from './docfiles.js'

const L = {
  step: 1, job: '', role: '', company: '', keywords: [], reqs: [], ev: {}, openKw: 0,
  name: '', currentTitle: '', years: '', why: '', unique: '', phone: '', location: '', linkedin: '', resume: '', template: 'modern',
  busy: false, analysing: false, err: '', cur: null, files: {}, docs: null, loading: false, hasResume: false, draft: null, saving: false, note: ''
}

export const coverText = c => [c.greeting, '', ...c.paragraphs.flatMap(p => [p, '']), c.closing, '', c.signoff].join('\n').trim()

async function load(ctx) {
  if (L.docs !== null || L.loading) return
  L.loading = true
  try {
    const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
    L.docs = d.docs
    const r = d.docs.find(x => x.kind === 'resume')
    L.hasResume = !!(r || (p.data.text || '').length >= 80)
    if (r) {
      L.name = L.name || r.content.name || ''
      L.phone = L.phone || r.content.contact?.phone || ''
      L.location = L.location || r.content.contact?.location || ''
      L.linkedin = L.linkedin || r.content.contact?.linkedin || ''
      L.template = r.content.template || L.template
      L.currentTitle = L.currentTitle || r.content.experience?.[0]?.title || ''
    }
    const c = d.docs.find(x => x.kind === 'cover')
    if (c && !L.cur) L.cur = c
  } catch (e) { L.docs = []; L.err = e.message }
  L.loading = false
  ctx.render()
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

const steps = ['The job', 'Your proof', 'About you']
const stepper = () => h('ol', { class: 'stepper', 'aria-label': 'Steps' }, steps.map((s, i) => h('li', { class: i + 1 === L.step ? 'on' : i + 1 < L.step ? 'past' : '', ...(i + 1 === L.step ? { 'aria-current': 'step' } : {}) }, h('span', {}, i + 1), s)))

export function coverScreen(ctx) {
  load(ctx)
  ensureFiles(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, 'Cover letter writer'),
    h('p', { class: 'muted' }, 'A strong letter is built on proof. We read the job ad, ask for your real examples against what it wants, then write the letter from those, in Australian format.'))
  if (L.docs === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const analyse = async () => {
    if (L.analysing) return
    L.err = ''
    if (L.job.trim().length < 60) { L.err = 'Paste the whole job ad first.'; ctx.render(); return }
    L.analysing = true; ctx.render()
    try {
      const d = await ctx.call('/api/newpage/app', { action: 'cover_analyse', job: L.job })
      L.keywords = d.keywords.slice(0, 10); L.reqs = d.requirements; L.openKw = 0; L.step = 2
    } catch (e) { L.err = e.message }
    L.analysing = false; ctx.render()
  }

  const generate = async () => {
    if (L.busy) return
    L.busy = true; L.err = ''; ctx.render()
    try {
      const evidence = L.keywords.map(k => ({ keyword: k, ...(L.ev[k] || {}) }))
      const d = await ctx.call('/api/newpage/app', {
        action: 'doc_generate', kind: 'cover', job: L.job, role: L.role, company: L.company, keywords: L.keywords, evidence, name: L.name, currentTitle: L.currentTitle, years: L.years,
        why: L.why, unique: L.unique, resume: L.hasResume ? '' : L.resume, template: L.template, contact: { phone: L.phone, location: L.location, linkedin: L.linkedin }
      })
      L.cur = d.doc; L.docs = [d.doc, ...L.docs.filter(x => x.id !== d.doc.id)]; L.draft = null
    } catch (e) { L.err = e.code === 'coach_off' ? 'The writer isn’t switched on yet.' : e.message }
    L.busy = false; ctx.render()
    if (L.cur && !L.err) document.getElementById('doc-result')?.scrollIntoView({ block: 'start' })
  }

  const inp = (id, label, prop, attrs = {}) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, type: 'text', maxlength: '160', value: L[prop], oninput: e => { L[prop] = e.target.value }, ...attrs }))
  const area = (id, label, prop, rows, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), hint && h('p', { class: 'small muted' }, hint), h('textarea', { id, rows: String(rows), maxlength: '2000', oninput: e => { L[prop] = e.target.value } }, L[prop]))

  let body
  if (L.step === 1) {
    body = [
      area('cv-job', 'The job ad', 'job', 9, 'Paste the whole thing, including what they require.'),
      h('div', { class: 'two' }, inp('cv-role', 'Role', 'role', { placeholder: 'e.g. Operations Coordinator' }), inp('cv-co', 'Organisation', 'company')),
      L.err && h('p', { class: 'error', role: 'alert' }, L.err),
      h('button', { class: 'btn btn-primary', type: 'button', disabled: L.analysing, onclick: analyse }, L.analysing ? 'Reading the ad…' : 'Read the ad and continue')
    ]
  } else if (L.step === 2) {
    body = [
      h('p', {}, 'Employers look for these. For each one you can back up, give a real example. Leave a box empty if you have nothing, and never guess a number.'),
      L.reqs.length > 0 && h('details', { class: 'reqs' }, h('summary', {}, `What the ad asks for (${L.reqs.length})`), h('ul', {}, L.reqs.map(r => h('li', {}, r)))),
      h('div', { class: 'kw-list' }, L.keywords.map((k, i) => {
        const e = L.ev[k] || (L.ev[k] = { situation: '', result: '', award: '' })
        const done = !!(e.situation || e.result || e.award)
        return h('details', { class: 'kw', open: i === L.openKw ? '' : null },
          h('summary', {}, h('b', {}, k), h('span', { class: done ? 'ok' : 'muted small' }, done ? 'Added' : 'Optional')),
          h('div', { class: 'field' }, h('label', { for: `ev-s-${i}` }, 'A real example (project, client, employer)'), h('textarea', { id: `ev-s-${i}`, rows: '2', maxlength: '600', oninput: ev => { e.situation = ev.target.value; ev.target.closest('details').querySelector('summary span').textContent = 'Added' } }, e.situation)),
          h('div', { class: 'field' }, h('label', { for: `ev-r-${i}` }, 'The result (a number, %, $, time saved)'), h('input', { id: `ev-r-${i}`, type: 'text', maxlength: '400', value: e.result, oninput: ev => { e.result = ev.target.value } })),
          h('div', { class: 'field' }, h('label', { for: `ev-a-${i}` }, 'Praise, award or promotion (optional)'), h('input', { id: `ev-a-${i}`, type: 'text', maxlength: '300', value: e.award, oninput: ev => { e.award = ev.target.value } })))
      })),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { L.step = 1; ctx.render() } }, 'Back'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { L.step = 3; ctx.render() } }, 'Continue'))
    ]
  } else {
    body = [
      h('div', { class: 'two' }, inp('cv-name', 'Your name', 'name'), inp('cv-title', 'Your current job title', 'currentTitle')),
      h('div', { class: 'two' }, inp('cv-years', 'Years of experience', 'years', { maxlength: '20' }), inp('cv-loc', 'Suburb and state', 'location', { placeholder: 'e.g. Parramatta, NSW' })),
      h('div', { class: 'two' }, inp('cv-phone', 'Phone', 'phone', { maxlength: '40' }), inp('cv-li', 'LinkedIn (optional)', 'linkedin')),
      area('cv-why', 'Why do you want this role?', 'why', 4),
      area('cv-unique', 'What sets you apart from other applicants?', 'unique', 4),
      L.hasResume ? h('p', { class: 'small muted' }, 'We’ll use the resume you saved in the Resume writer.') : area('cv-res', 'Your resume', 'resume', 7, 'Paste it here, or write it in the Resume writer first.'),
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
  const result = cur && h('div', { id: 'doc-result', class: 'card doc-result' },
    h('span', { class: 'label' }, cur.title),
    files ? pagePreview(files.html) : h('p', { class: 'loading small' }, 'Building the preview…'),
    h('div', { class: 'row doc-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', disabled: !files, onclick: () => saveB64(`${safeName(cur.title)}.docx`, files.docx, DOCX_TYPE) }, 'Download Word file'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(coverText(cur.content), e.currentTarget) }, 'Copy text')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Style'),
      templatePicker(cur.content.template || 'modern', async id => {
        try { const r = await ctx.call('/api/newpage/app', { action: 'doc_template', id: cur.id, template: id }); L.cur = r.doc; L.docs = L.docs.map(x => (x.id === r.doc.id ? r.doc : x)); L.template = id } catch (e) { L.err = e.message }
        ctx.render()
      })),
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
    mine.map(x => h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.cur = x; L.draft = null; ctx.render(); document.getElementById('doc-result')?.scrollIntoView({ block: 'start' }) } }, `${x.title} · ${new Date(x.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${x.title}`, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: x.id }); L.docs = L.docs.filter(y => y.id !== x.id); if (L.cur?.id === x.id) L.cur = null } catch (e) { L.err = e.message } ctx.render() } }, '×'))))

  return h('section', { class: 'screen docs' }, head, h('div', { class: 'docs-cols' }, h('div', {}, form), h('div', {}, result || h('div', { class: 'docs-empty muted small' }, 'Your letter appears here.'), saved)))
}
