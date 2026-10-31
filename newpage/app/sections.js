// The AI-written documents that are sections of text: the Career Direction
// Report, LinkedIn profile, outreach messages, session brief and progress
// report. Each is written from what the member has entered, and saved.
import { h, download, copyText } from './ui.js'

const KINDS = {
  report: { title: 'Career Direction Report', lead: 'One personal document that pulls your Compass, your check-ins and your notes together: where you are, what matters, directions worth testing, and your next 30 days.', button: 'Create my report', fields: [['focus', 'Anything you’d like the report to focus on? (optional)', 'textarea', 'e.g. Whether I should stay in my industry']] },
  linkedin: { title: 'LinkedIn profile writer', lead: 'A headline, About section, experience bullets and skills, written from your own work history. It never invents anything.', button: 'Write my profile', needsBackground: true, fields: [['role', 'The role or field you’re aiming at', 'text', 'e.g. Operations manager'], ['job', 'A job ad you’re aiming at (optional)', 'textarea', 'Paste the whole ad']] },
  outreach: { title: 'Outreach messages', lead: 'Three short messages for one person: asking for a 15 to 20 minute conversation, a polite follow-up, and a thank-you after you’ve spoken.', button: 'Write my messages', fields: [['who', 'Who are you writing to?', 'text', 'e.g. Sam Lee, team leader at Acme Logistics'], ['why', 'Why them? How do you know them, if you do?', 'textarea', 'e.g. We met at a conference. I admire how they moved from nursing into operations.'], ['goal', 'What would you like to learn from them?', 'text', 'e.g. What a normal week looks like']] },
  brief: { title: 'Session brief for Vik', lead: 'Answer four questions and we’ll turn them, with your plan and check-in, into a one-page brief. Vik reads it before your session, so you start on what matters.', button: 'Create my brief', fields: [['want', 'What do you most want from your session?', 'textarea', ''], ['worry', 'What’s your biggest worry right now?', 'textarea', ''], ['tried', 'What have you already tried?', 'textarea', ''], ['success', 'What would success look like in a month?', 'textarea', '']] },
  progress: { title: 'Progress Report', lead: 'A short report on your four weeks: what you did, what has changed since your first check-in, what you’ve learned about yourself, and your next 30 days.', button: 'Create my Progress Report', fields: [] }
}

const L = {}
const st = kind => (L[kind] ||= { fields: {}, background: null, busy: false, err: '', current: null, docs: null, loaded: false })

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function sectionsText(c) {
  return [c.title ? c.title.toUpperCase() : '', ...c.sections.flatMap(s => ['', s.heading.toUpperCase(), ...s.paragraphs, ...s.bullets.map(b => `- ${b}`)])].join('\n').trim()
}

function wordHtml(doc) {
  const c = doc.content
  const body = `<h1 style="font-size:20pt;margin:0 0 8pt">${esc(c.title || doc.title)}</h1>` + c.sections.map(s => `<h2 style="font-size:12pt;border-bottom:1px solid #444;margin:14pt 0 4pt;text-transform:uppercase">${esc(s.heading)}</h2>` + s.paragraphs.map(p => `<p>${esc(p)}</p>`).join('') + (s.bullets.length ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '')).join('')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(doc.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4">${body}</body></html>`
}

function preview(doc) {
  const c = doc.content
  return h('div', { class: 'doc-page' }, h('h3', {}, c.title || doc.title), c.sections.map(s => [
    h('h4', {}, s.heading), s.paragraphs.map(p => h('p', {}, p)), s.bullets.length > 0 && h('ul', {}, s.bullets.map(b => h('li', {}, b)))
  ]))
}

async function load(ctx, kind) {
  const s = st(kind)
  if (s.loaded) return
  s.loaded = true
  try {
    const [p, d] = await Promise.all([ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'profile' }), ctx.call('/api/newpage/app', { action: 'doc_list' })])
    s.background = p.data.text || ''; s.docs = d.docs
  } catch (e) { s.background = ''; s.docs = []; s.err = e.message }
  ctx.render()
}

export const sectionKinds = Object.keys(KINDS)

export function sectionsScreen(ctx, kind) {
  const K = KINDS[kind], s = st(kind)
  load(ctx, kind)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, K.title), h('p', { class: 'muted' }, K.lead))
  if (s.docs === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const generate = async () => {
    if (s.busy) return
    s.busy = true; s.err = ''; ctx.render()
    try {
      const d = await ctx.call('/api/newpage/app', { action: 'doc_generate', kind, fields: s.fields, background: K.needsBackground ? s.background : undefined })
      s.current = d.doc; s.docs = [d.doc, ...s.docs.filter(x => x.id !== d.doc.id)]
    } catch (e) { s.err = e.code === 'coach_off' ? 'The writer isn’t switched on yet.' : e.message }
    s.busy = false; ctx.render()
    if (s.current) document.getElementById('doc-result')?.scrollIntoView({ block: 'start' })
  }

  const form = h('form', { class: 'card', novalidate: true, onsubmit: e => { e.preventDefault(); generate() } },
    K.needsBackground && h('div', { class: 'field' }, h('label', { for: 'sec-bg' }, 'Your work history'),
      h('p', { class: 'small muted' }, 'Roles, employers, dates, what you achieved. Saved, so you only paste it once.'),
      h('textarea', { id: 'sec-bg', rows: '8', maxlength: '12000', oninput: e => { s.background = e.target.value } }, s.background)),
    K.fields.map(([key, label, type, ph]) => h('div', { class: 'field' }, h('label', { for: 'sec-' + key }, label),
      type === 'textarea'
        ? h('textarea', { id: 'sec-' + key, rows: key === 'job' ? '6' : '3', maxlength: key === 'job' ? '6000' : '800', placeholder: ph, oninput: e => { s.fields[key] = e.target.value } }, s.fields[key] || '')
        : h('input', { id: 'sec-' + key, type: 'text', maxlength: '300', placeholder: ph, value: s.fields[key] || '', oninput: e => { s.fields[key] = e.target.value } }))),
    s.err && h('p', { class: 'error', role: 'alert' }, s.err),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: s.busy }, s.busy ? 'Writing… this can take a couple of minutes' : K.button),
    h('p', { class: 'small muted' }, 'Written by an AI from what you’ve entered. It’s told never to invent anything, but please read every line.'))

  const cur = s.current
  const result = cur && h('div', { id: 'doc-result', class: 'card doc-result' },
    h('span', { class: 'label' }, cur.title), preview(cur),
    h('div', { class: 'row doc-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => download(`${(cur.title || kind).replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || kind}.doc`, wordHtml(cur), 'application/msword') }, 'Download for Word'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(sectionsText(cur.content), e.currentTarget) }, 'Copy text'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => window.print() }, 'Print or save as PDF')),
    kind === 'brief' && h('p', { class: 'small' }, 'Vik can read your latest brief before your session.'))

  const mine = s.docs.filter(d => d.kind === kind && (!cur || d.id !== cur.id))
  const saved = mine.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Saved'),
    mine.map(d => h('div', { class: 'mem' }, h('button', { class: 'link-btn blue', type: 'button', onclick: () => { s.current = d; ctx.render(); document.getElementById('doc-result')?.scrollIntoView({ block: 'start' }) } }, `${d.title} · ${new Date(d.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${d.title}`, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'doc_delete', id: d.id }); s.docs = s.docs.filter(x => x.id !== d.id); if (s.current?.id === d.id) s.current = null } catch (e) { s.err = e.message } ctx.render() } }, '×'))))

  return h('section', { class: 'screen docs' }, head, h('div', { class: 'docs-cols' }, h('div', {}, form, saved), result || h('div', { class: 'docs-empty muted small' }, 'Your document appears here.')))
}
