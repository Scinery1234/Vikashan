// Resume and cover letter writer. The member pastes their work history (and
// optionally a job ad); the server writes a tailored document from their own
// facts only. Documents are saved so they can be reopened.
import { h, download, copyText } from './ui.js'

const L = { kind: 'resume', background: null, job: '', company: '', role: '', busy: false, err: '', current: null, docs: null, loadingDocs: false }

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function resumeText(r) {
  const out = []
  if (r.name) out.push(r.name.toUpperCase())
  const c = [r.contact.phone, r.contact.email, r.contact.location, r.contact.linkedin].filter(Boolean).join(' | ')
  if (c) out.push(c)
  if (r.summary) out.push('', 'PROFESSIONAL SUMMARY', r.summary)
  if (r.key_skills.length) out.push('', 'KEY SKILLS', ...r.key_skills.map(s => `- ${s}`))
  if (r.experience.length) {
    out.push('', 'PROFESSIONAL EXPERIENCE')
    for (const e of r.experience) out.push('', [e.title, e.company].filter(Boolean).join(', ') + (e.dates ? ` (${e.dates})` : '') + (e.location ? `, ${e.location}` : ''), ...e.bullets.map(b => `- ${b}`))
  }
  if (r.education.length) out.push('', 'EDUCATION', ...r.education.map(e => [e.degree, e.institution, e.year].filter(Boolean).join(', ')))
  if (r.certifications.length) out.push('', 'CERTIFICATIONS', ...r.certifications.map(s => `- ${s}`))
  if (r.awards.length) out.push('', 'AWARDS', ...r.awards.map(s => `- ${s}`))
  if (r.additional.length) out.push('', 'ADDITIONAL INFORMATION', ...r.additional.map(s => `- ${s}`))
  return out.join('\n')
}
export const coverText = c => [c.greeting, '', ...c.paragraphs.flatMap(p => [p, '']), c.closing, '', c.signoff].filter(x => x !== undefined).join('\n').trim()

// A Word-readable file. Word opens HTML saved as .doc.
function wordHtml(doc) {
  const c = doc.content
  let body
  if (doc.kind === 'resume') {
    const sec = t => `<h2 style="font-size:12pt;border-bottom:1px solid #444;margin:14pt 0 4pt;text-transform:uppercase">${esc(t)}</h2>`
    const ul = a => `<ul style="margin:2pt 0 6pt">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    body = `<h1 style="font-size:20pt;margin:0">${esc(c.name)}</h1><p style="margin:2pt 0">${esc([c.contact.phone, c.contact.email, c.contact.location, c.contact.linkedin].filter(Boolean).join(' | '))}</p>`
      + (c.summary ? sec('Professional summary') + `<p>${esc(c.summary)}</p>` : '')
      + (c.key_skills.length ? sec('Key skills') + ul(c.key_skills) : '')
      + (c.experience.length ? sec('Professional experience') + c.experience.map(e => `<p style="margin:8pt 0 0"><b>${esc(e.title)}</b>${e.company ? ', ' + esc(e.company) : ''}${e.location ? ', ' + esc(e.location) : ''}${e.dates ? ' <i>(' + esc(e.dates) + ')</i>' : ''}</p>` + ul(e.bullets)).join('') : '')
      + (c.education.length ? sec('Education') + c.education.map(e => `<p style="margin:2pt 0">${esc([e.degree, e.institution, e.year].filter(Boolean).join(', '))}</p>`).join('') : '')
      + (c.certifications.length ? sec('Certifications') + ul(c.certifications) : '')
      + (c.awards.length ? sec('Awards') + ul(c.awards) : '')
      + (c.additional.length ? sec('Additional information') + ul(c.additional) : '')
  } else {
    body = `<p>${esc(c.greeting)}</p>` + c.paragraphs.map(p => `<p>${esc(p)}</p>`).join('') + `<p>${esc(c.closing)}</p><p>${esc(c.signoff)}</p>`
  }
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(doc.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.35">${body}</body></html>`
}

function preview(doc) {
  const c = doc.content
  if (doc.kind === 'cover') {
    return h('div', { class: 'doc-page' }, h('p', {}, c.greeting), c.paragraphs.map(p => h('p', {}, p)), h('p', {}, c.closing), h('p', {}, c.signoff))
  }
  const sec = (t, ...kids) => [h('h4', {}, t), ...kids]
  return h('div', { class: 'doc-page' },
    h('h3', {}, c.name || 'Your name'),
    h('p', { class: 'small muted' }, [c.contact.phone, c.contact.email, c.contact.location, c.contact.linkedin].filter(Boolean).join(' · ')),
    c.summary && sec('Professional summary', h('p', {}, c.summary)),
    c.key_skills.length > 0 && sec('Key skills', h('ul', {}, c.key_skills.map(s => h('li', {}, s)))),
    c.experience.length > 0 && sec('Professional experience', c.experience.map(e => h('div', {}, h('p', {}, h('b', {}, e.title), e.company && ', ' + e.company, e.location && ', ' + e.location, e.dates && h('i', {}, ` (${e.dates})`)), h('ul', {}, e.bullets.map(b => h('li', {}, b)))))),
    c.education.length > 0 && sec('Education', c.education.map(e => h('p', {}, [e.degree, e.institution, e.year].filter(Boolean).join(', ')))),
    c.certifications.length > 0 && sec('Certifications', h('ul', {}, c.certifications.map(s => h('li', {}, s)))),
    c.awards.length > 0 && sec('Awards', h('ul', {}, c.awards.map(s => h('li', {}, s)))),
    c.additional.length > 0 && sec('Additional information', h('ul', {}, c.additional.map(s => h('li', {}, s)))))
}

async function load(ctx) {
  if (L.background === null && !L.loadingDocs) {
    L.loadingDocs = true
    try {
      const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
      L.background = p.data.text || ''
      L.docs = d.docs
    } catch (e) { L.background = ''; L.docs = []; L.err = e.message }
    L.loadingDocs = false
    ctx.render()
  }
}

export function docsScreen(ctx, kind) {
  if (L.kind !== kind) Object.assign(L, { kind, current: null, err: '' })
  load(ctx)
  const isResume = kind === 'resume'
  const title = isResume ? 'Resume writer' : 'Cover letter writer'
  const head = h('div', {}, h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, title),
    h('p', { class: 'muted' }, isResume ? 'Paste your work history and, if you have one, the job ad. You get a tailored resume built only from your own facts.' : 'Paste your work history and the job ad. You get a short letter in your voice, built only from your own facts.'))
  if (L.background === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const generate = async () => {
    if (L.busy) return
    L.busy = true; L.err = ''; ctx.render()
    try {
      const d = await ctx.call('/api/newpage/app', { action: 'doc_generate', kind, background: L.background, job: L.job, company: L.company, role: L.role })
      L.current = d.doc; L.docs = [d.doc, ...(L.docs || []).filter(x => x.id !== d.doc.id)]
    } catch (e) { L.err = e.code === 'coach_off' ? 'The writer isn’t switched on yet.' : e.message }
    L.busy = false; ctx.render()
    if (L.current) document.getElementById('doc-result')?.scrollIntoView({ block: 'start' })
  }

  const form = h('form', { class: 'card', novalidate: true, onsubmit: e => { e.preventDefault(); generate() } },
    h('div', { class: 'field' }, h('label', { for: 'doc-bg' }, 'Your work history'),
      h('p', { class: 'small muted' }, 'Roles, employers, dates, what you achieved, qualifications. Messy is fine; copy in your old resume if you have one. Saved so you only paste it once.'),
      h('textarea', { id: 'doc-bg', rows: '10', maxlength: '12000', placeholder: 'e.g. 2019 to now: Team leader, Acme Logistics, Parramatta. Ran a team of 8, cut late deliveries by 30%…', oninput: e => { L.background = e.target.value } }, L.background)),
    !isResume && h('div', { class: 'two' },
      h('div', { class: 'field' }, h('label', { for: 'doc-role' }, 'Role you’re applying for'), h('input', { id: 'doc-role', type: 'text', maxlength: '120', value: L.role, oninput: e => { L.role = e.target.value } })),
      h('div', { class: 'field' }, h('label', { for: 'doc-co' }, 'Organisation'), h('input', { id: 'doc-co', type: 'text', maxlength: '120', value: L.company, oninput: e => { L.company = e.target.value } }))),
    h('div', { class: 'field' }, h('label', { for: 'doc-job' }, isResume ? 'Job ad (optional, but it makes the resume much better)' : 'Job ad'),
      h('textarea', { id: 'doc-job', rows: '7', maxlength: '6000', placeholder: 'Paste the whole ad here', oninput: e => { L.job = e.target.value } }, L.job)),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: L.busy }, L.busy ? 'Writing… this takes up to a minute' : isResume ? 'Write my resume' : 'Write my cover letter'),
    h('p', { class: 'small muted' }, 'Written by an AI from what you paste. It is told never to invent anything, but you must check every line before you send it.'))

  const cur = L.current
  const result = cur && h('div', { id: 'doc-result', class: 'card doc-result' },
    h('span', { class: 'label' }, cur.title),
    preview(cur),
    h('div', { class: 'row doc-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => download(`${cur.title.replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || cur.kind}.doc`, wordHtml(cur), 'application/msword') }, 'Download for Word'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(cur.kind === 'resume' ? resumeText(cur.content) : coverText(cur.content), e.currentTarget) }, 'Copy text'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => window.print() }, 'Print or save as PDF')),
    h('p', { class: 'small muted' }, 'Want it changed? Edit your work history or the ad above and write it again.'))

  const mine = (L.docs || []).filter(d => d.kind === kind && (!cur || d.id !== cur.id))
  const saved = mine.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Saved'),
    mine.map(d => h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => { L.current = d; ctx.render(); document.getElementById('doc-result')?.scrollIntoView({ block: 'start' }) } }, `${d.title} · ${new Date(d.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${d.title}`, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: d.id }); L.docs = L.docs.filter(x => x.id !== d.id); if (L.current?.id === d.id) L.current = null } catch (e) { L.err = e.message } ctx.render() } }, '×'))))

  return h('section', { class: 'screen docs' }, head, form, result, saved)
}
