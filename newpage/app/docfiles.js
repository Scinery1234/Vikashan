// Shared bits for the resume and cover letter writers: the Word files and
// previews are built by api/newpage/docx.py (the Resume-Generator builder),
// so what you see here is what lands in Word.
import { h } from './ui.js'

export const safeName = title => (String(title || 'document').replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'document')

export function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error('We couldn’t read that file.'))
    r.readAsDataURL(file)
  })
}

export function saveB64(name, b64, type) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Shows the builder's HTML inside a shadow root, so its styles can't leak into
// the app (and the app's can't change it). Scaled down to fit narrow screens.
export function pagePreview(html) {
  const host = h('div', { class: 'page-preview' })
  const root = host.attachShadow({ mode: 'open' })
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const css = [...dom.querySelectorAll('style')].map(s => s.textContent).join('\n').replace(/\b(html|body)\b(?=\s*[,{])/g, '.np-root')
  const style = document.createElement('style')
  style.textContent = `${css}\n.np-root{background:#fff;width:794px;box-sizing:border-box;margin:0}`
  const wrap = document.createElement('div')
  wrap.className = 'np-root'
  for (const n of [...dom.body.childNodes]) wrap.append(document.importNode(n, true))
  root.append(style, wrap)
  wrap.querySelectorAll('a').forEach(a => { a.removeAttribute('href'); a.removeAttribute('target') })
  requestAnimationFrame(() => {
    const w = host.clientWidth
    if (w && w < 794) { wrap.style.zoom = String(w / 794) }
  })
  return host
}

// Word, PDF or text only. There is deliberately no `accept` filter on the file input: phones
// can mistake extension lists for "photos only" and offer just the camera.
export function resumeFileProblem(file) {
  if (!file) return 'Choose a file first.'
  const name = (file.name || '').toLowerCase()
  if (/\.(docx|pdf|txt|md)$/.test(name)) return file.size > 3 * 1024 * 1024 ? 'That file is over 3 MB. Try a smaller one, or paste the text.' : ''
  if (/\.doc$/.test(name)) return 'Older .doc files can’t be read. Save it as .docx or PDF first, or paste the text.'
  if (/\.(jpe?g|png|heic|gif|webp)$/.test(name) || /^image\//.test(file.type || '')) return 'That looks like a photo. Upload a Word or PDF file, or paste the text.'
  return 'Upload a Word (.docx), PDF or text file, or paste the text.'
}

// ── Plain fallback, used only if the Word builder (api/newpage/docx.py) can't be reached.
// It keeps the member from being stuck: they still get a readable preview and a basic Word file.
const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const CSS = 'body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.4;color:#1a1a1a;margin:0}.pg{padding:1.8cm 2cm}h1{font-size:19pt;margin:0 0 2px}h2{font-size:10pt;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #444;margin:14pt 0 4pt;padding-bottom:1pt}p{margin:0 0 6pt}ul{margin:2pt 0 6pt;padding-left:18pt}.m{color:#555}'
const ul = a => (a?.length ? `<ul>${a.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : '')

export function resumeDocHtml(c) {
  const k = c.contact || {}
  const tech = Object.entries(c.technical_skills || {}).map(([g, v]) => `<p><b>${e(g)}:</b> ${e(v.join(', '))}</p>`).join('')
  const sec = (t, body) => (body ? `<h2>${t}</h2>${body}` : '')
  return `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="pg"><h1>${e(c.name)}</h1><p class="m">${e([k.location, k.phone, k.email, k.linkedin].filter(Boolean).join(' | '))}</p>`
    + sec('Professional summary', c.summary ? `<p>${e(c.summary)}</p>` : '')
    + sec('Key skills', ul(c.key_skills))
    + sec('Professional experience', (c.experience || []).map(x => `<p><b>${e(x.title)}</b>${x.company ? ', ' + e(x.company) : ''}${x.location ? ', ' + e(x.location) : ''}${x.dates ? ` <i>(${e(x.dates)})</i>` : ''}</p>${ul(x.bullets)}`).join(''))
    + sec('Education', (c.education || []).map(x => `<p>${e([x.degree, x.institution, x.year].filter(Boolean).join(', '))}</p>`).join(''))
    + sec('Awards', ul(c.awards)) + sec('Certifications', ul(c.certifications)) + sec('Technical skills', tech) + sec('Additional information', ul(c.additional_information))
    + '</div></body></html>'
}

export function coverDocHtml(c) {
  const k = c.contact || {}
  return `<html><head><meta charset="utf-8"><style>${CSS}p{margin:0 0 9pt}</style></head><body><div class="pg"><h1>${e(c.name)}</h1><p class="m">${e([k.location, k.phone, k.email, k.linkedin].filter(Boolean).join(' | '))}</p>`
    + (c.date ? `<p>${e(c.date)}</p>` : '') + ((c.recipient || []).length ? `<p>${c.recipient.map(e).join('<br>')}</p>` : '')
    + (c.subject ? `<p><b>${e(c.subject)}</b></p>` : '') + `<p>${e(c.greeting)}</p>` + (c.paragraphs || []).map(p => `<p>${e(p)}</p>`).join('') + `<p>${e(c.closing)}</p><p><b>${e(c.signoff)}</b></p></div></body></html>`
}

// Word opens HTML saved as .doc.
export const asWordDoc = (html, title) => html.replace('<head>', `<head><title>${e(title)}</title>`).replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">')
