// Resume writer. Upload or paste your current resume, say what job you're
// aiming at, pick a style, and get an Australian-format resume built only from
// your own facts. The Word file comes from the Resume-Generator builder.
import { h, copyText } from './ui.js'
import { templatePicker, pagePreview, saveB64, DOCX_TYPE, safeName, fileToB64 } from './docfiles.js'

const L = { text: null, fileName: '', job: '', extra: '', role: '', template: 'modern', busy: false, uploading: false, err: '', note: '', cur: null, files: {}, docs: null, loading: false, edit: '', editBusy: false, pasteOpen: false }

export function resumeText(r) {
  const out = []
  if (r.name) out.push(r.name.toUpperCase())
  const c = [r.contact?.phone, r.contact?.email, r.contact?.location, r.contact?.linkedin].filter(Boolean).join(' | ')
  if (c) out.push(c)
  if (r.summary) out.push('', 'PROFESSIONAL SUMMARY', r.summary)
  if (r.key_skills?.length) out.push('', 'KEY SKILLS', ...r.key_skills.map(s => `- ${s}`))
  if (r.experience?.length) {
    out.push('', 'PROFESSIONAL EXPERIENCE')
    for (const e of r.experience) out.push('', [e.title, e.company].filter(Boolean).join(' | ') + (e.location ? ` | ${e.location}` : '') + (e.dates ? ` | ${e.dates}` : ''), ...e.bullets.map(b => `- ${b}`))
  }
  if (r.education?.length) out.push('', 'EDUCATION', ...r.education.map(e => [e.degree, e.institution, e.year].filter(Boolean).join(', ')))
  if (r.awards?.length) out.push('', 'AWARDS', ...r.awards.map(s => `- ${s}`))
  if (r.certifications?.length) out.push('', 'CERTIFICATIONS', ...r.certifications.map(s => `- ${s}`))
  const tech = Object.entries(r.technical_skills || {})
  if (tech.length) out.push('', 'TECHNICAL SKILLS', ...tech.map(([k, v]) => `${k}: ${v.join(', ')}`))
  if (r.additional_information?.length) out.push('', 'ADDITIONAL INFORMATION', ...r.additional_information.map(s => `- ${s}`))
  return out.join('\n')
}

async function load(ctx) {
  if (L.text !== null || L.loading) return
  L.loading = true
  try {
    const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
    L.text = p.data.text || ''
    L.docs = d.docs
    const last = d.docs.find(x => x.kind === 'resume')
    if (last && !L.cur) { L.cur = last; L.template = last.content.template || 'modern' }
  } catch (e) { L.text = ''; L.docs = []; L.err = e.message }
  L.loading = false
  ctx.render()
}

// Word file and preview for the open resume, fetched once per resume + style.
async function ensureFiles(ctx) {
  const d = L.cur
  if (!d) return
  const key = d.id + ':' + (d.content.template || 'modern') + ':' + JSON.stringify(d.content).length
  if (L.files[key] || L.files['busy:' + key]) return
  L.files['busy:' + key] = true
  try {
    L.files[key] = await ctx.call('/api/newpage/docx', { token: ctx.token(), action: 'resume', data: d.content, template: d.content.template || 'modern' })
  } catch (e) { L.err = e.message }
  delete L.files['busy:' + key]
  ctx.render()
}
const filesFor = () => { const d = L.cur; return d && L.files[d.id + ':' + (d.content.template || 'modern') + ':' + JSON.stringify(d.content).length] }

async function upload(ctx, file) {
  if (!file) return
  if (file.size > 3 * 1024 * 1024) { L.err = 'That file is over 3 MB. Try a smaller one, or paste the text.'; ctx.render(); return }
  L.uploading = true; L.err = ''; ctx.render()
  try {
    const d = await ctx.call('/api/newpage/docx', { token: ctx.token(), action: 'extract', filename: file.name, file: await fileToB64(file) })
    L.text = d.text; L.fileName = file.name; L.pasteOpen = true
  } catch (e) { L.err = e.message }
  L.uploading = false; ctx.render()
}

export function resumeScreen(ctx) {
  load(ctx)
  ensureFiles(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, 'Resume writer'),
    h('p', { class: 'muted' }, 'Upload your current resume, tell us the job you want, and we’ll rewrite it in the Australian format, matched to that job. Everything comes from your own resume. Nothing is made up.'))
  if (L.text === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const generate = async () => {
    if (L.busy) return
    L.busy = true; L.err = ''; L.note = ''; ctx.render()
    try {
      const d = await ctx.call('/api/newpage/app', { action: 'doc_generate', kind: 'resume', background: L.text, job: L.job, additional: L.extra, role: L.role, template: L.template })
      L.cur = d.doc; L.docs = [d.doc, ...(L.docs || []).filter(x => x.id !== d.doc.id)]
    } catch (e) { L.err = e.code === 'coach_off' ? 'The writer isn’t switched on yet.' : e.message }
    L.busy = false; ctx.render()
    if (L.cur && !L.err) document.getElementById('doc-result')?.scrollIntoView({ block: 'start' })
  }

  const fileInput = h('input', { type: 'file', id: 'res-file', accept: '.docx,.pdf,.txt,.md', class: 'sr-only', onchange: e => upload(ctx, e.target.files[0]) })
  const form = h('form', { class: 'card doc-form', novalidate: true, onsubmit: e => { e.preventDefault(); generate() } },
    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '1'), h('div', {}, h('b', {}, 'Your current resume'), h('p', { class: 'small muted' }, 'A Word or PDF file, or paste the text. An old, messy one is fine. We keep it so you only do this once.'))),
    h('div', { class: 'row' },
      fileInput,
      h('label', { for: 'res-file', class: 'btn btn-secondary', role: 'button', tabindex: '0', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click() } } }, L.uploading ? 'Reading your file…' : L.text ? 'Upload a different file' : 'Upload your resume'),
      !L.pasteOpen && h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.pasteOpen = true; ctx.render() } }, L.text ? 'View or edit the text' : 'Or paste it')),
    L.fileName && h('p', { class: 'small' }, `Loaded ${L.fileName}. Check the text below, since PDFs can come out a little jumbled.`),
    (L.pasteOpen || L.text) && h('div', { class: 'field' }, h('label', { for: 'res-text', class: 'sr-only' }, 'Your resume text'),
      h('textarea', { id: 'res-text', rows: '9', maxlength: '20000', placeholder: 'Roles, employers, dates, what you achieved, qualifications…', oninput: e => { L.text = e.target.value } }, L.text)),

    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '2'), h('div', {}, h('b', {}, 'The job you’re aiming at'), h('p', { class: 'small muted' }, 'Paste the whole job ad for the best match, or just a job title. Leave it blank for a strong general resume.'))),
    h('div', { class: 'field' }, h('label', { for: 'res-job', class: 'sr-only' }, 'Job ad or title'),
      h('textarea', { id: 'res-job', rows: '6', maxlength: '8000', placeholder: 'Paste the job ad, or type a job title', oninput: e => { L.job = e.target.value } }, L.job)),
    h('div', { class: 'field' }, h('label', { for: 'res-extra' }, 'Anything else to include? (optional)'),
      h('textarea', { id: 'res-extra', rows: '3', maxlength: '3000', placeholder: 'e.g. a project not on your old resume, a licence, a reason you’re changing fields', oninput: e => { L.extra = e.target.value } }, L.extra)),

    h('div', { class: 'doc-step' }, h('span', { class: 'num' }, '3'), h('div', {}, h('b', {}, 'Style'), h('p', { class: 'small muted' }, 'You can change this after.'))),
    templatePicker(L.template, id => { L.template = id; ctx.render() }),

    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: L.busy || L.uploading }, L.busy ? 'Writing your resume… up to a minute' : 'Write my resume'),
    h('p', { class: 'small muted' }, 'Written by an AI from your own resume. It’s told never to invent anything, but check every line before you send it.'))

  const cur = L.cur
  const files = filesFor()
  const result = cur && h('div', { id: 'doc-result', class: 'card doc-result' },
    h('span', { class: 'label' }, cur.title),
    files ? pagePreview(files.html) : h('p', { class: 'loading small' }, 'Building the preview…'),
    h('div', { class: 'row doc-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', disabled: !files, onclick: () => saveB64(`${safeName(cur.content.name ? 'resume-' + cur.content.name : cur.title)}.docx`, files.docx, DOCX_TYPE) }, 'Download Word file'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(resumeText(cur.content), e.currentTarget) }, 'Copy text')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Style'),
      templatePicker(cur.content.template || 'modern', async id => {
        try { const d = await ctx.call('/api/newpage/app', { action: 'doc_template', id: cur.id, template: id }); L.cur = d.doc; L.template = id; L.docs = L.docs.map(x => (x.id === d.doc.id ? d.doc : x)) } catch (e) { L.err = e.message }
        ctx.render()
      })),
    h('form', { class: 'field', onsubmit: async e => {
      e.preventDefault()
      if (L.editBusy || L.edit.trim().length < 4) return
      L.editBusy = true; L.err = ''; ctx.render()
      try { const d = await ctx.call('/api/newpage/app', { action: 'doc_edit', id: cur.id, instruction: L.edit }); L.cur = d.doc; L.docs = L.docs.map(x => (x.id === d.doc.id ? d.doc : x)); L.edit = ''; L.note = 'Changed.' } catch (er) { L.err = er.message }
      L.editBusy = false; ctx.render()
    } },
      h('label', { for: 'res-edit' }, 'Want something changed?'),
      h('div', { class: 'add-row' }, h('input', { id: 'res-edit', type: 'text', maxlength: '1000', placeholder: 'e.g. make the summary shorter', value: L.edit, oninput: e => { L.edit = e.target.value } }), h('button', { class: 'btn btn-secondary', type: 'submit', disabled: L.editBusy }, L.editBusy ? 'Changing…' : 'Change it')),
      L.note && h('p', { class: 'small' }, L.note)))

  const mine = (L.docs || []).filter(d => d.kind === 'resume' && (!cur || d.id !== cur.id))
  const saved = mine.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Saved resumes'),
    mine.map(d => h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.cur = d; L.template = d.content.template || 'modern'; ctx.render(); document.getElementById('doc-result')?.scrollIntoView({ block: 'start' }) } }, `${d.title} · ${new Date(d.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${d.title}`, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: d.id }); L.docs = L.docs.filter(x => x.id !== d.id) } catch (e) { L.err = e.message } ctx.render() } }, '×'))))

  return h('section', { class: 'screen docs' }, head, h('div', { class: 'docs-cols' }, h('div', {}, form), h('div', {}, result || h('div', { class: 'docs-empty muted small' }, 'Your resume appears here.'), saved)))
}
