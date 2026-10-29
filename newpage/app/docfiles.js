// Shared bits for the resume and cover letter writers: the Word files and
// previews are built by api/newpage/docx.py (the Resume-Generator builder),
// so what you see here is what lands in Word.
import { h } from './ui.js'

export const TEMPLATES = [
  { id: 'modern', name: 'Modern', note: 'Navy sidebar' },
  { id: 'classic', name: 'Classic', note: 'Serif, one column' },
  { id: 'minimal', name: 'Minimal', note: 'Light and quiet' },
  { id: 'executive', name: 'Executive', note: 'Charcoal and gold' },
  { id: 'creative', name: 'Creative', note: 'Purple header' }
]

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

export function templatePicker(current, onPick) {
  return h('div', { class: 'tmpl-pick', role: 'radiogroup', 'aria-label': 'Style' },
    TEMPLATES.map(t => h('button', { type: 'button', role: 'radio', 'aria-checked': String(t.id === current), class: 'tmpl-opt' + (t.id === current ? ' on' : ''), onclick: () => onPick(t.id) },
      h('b', {}, t.name), h('small', {}, t.note))))
}
