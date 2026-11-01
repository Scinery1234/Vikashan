// The memory page: for someone whose New Page membership has ended. Opened from
// the link in the reminder emails. They can see what Sky holds, download it, or
// delete it for good. Nothing here is built from their data except text.
const main = document.getElementById('main')
const token = new URL(location.href).searchParams.get('t') || ''

const el = (tag, text, attrs = {}, ...kids) => {
  const e = document.createElement(tag)
  if (text != null && text !== '') e.textContent = text
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v) }
  e.append(...kids.flat().filter(Boolean))
  return e
}
const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

async function api(action, extra = {}) {
  const res = await fetch('/api/newpage/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, ...extra }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { code: data.code })
  return data
}

let confirming = false, message = ''
async function show() {
  let s
  try { s = await api('status') } catch (e) { main.replaceChildren(el('h1', 'This link has expired'), el('p', e.message)); return }
  const hello = s.name ? `Hi ${s.name}. ` : ''
  let lead
  if (s.state === 'purged') lead = 'Your memory has been permanently deleted. Nothing is held.'
  else if (s.hasAccess) lead = `${hello}You’re a member again, so Sky remembers you as normal. Open the New Page app to carry on.`
  else if (s.state === 'trash') lead = `${hello}Sky’s memory of you is in the Trash. Sky can’t use it. It will be permanently deleted on ${fmt(s.deletedOn)}.`
  else lead = `${hello}Sky is still holding what it knows about you. On ${s.trashOn ? fmt(s.trashOn) : 'day 30'} it moves to the Trash, and 12 months after that it’s permanently deleted.`
  const box = el('div', null, { class: 'card' })
  box.append(el('span', 'What’s held', { class: 'label' }), el('p', 'Your chats with Sky, the notes Sky keeps about you, your resume, your answers about yourself, your private notes, and anything you shared with Vik. It’s all encrypted. Your Compass, documents, tasks and progress are separate.'))
  main.replaceChildren(
    el('div', null, {}, el('span', 'your privacy', { class: 'note' }), el('h1', 'Sky’s memory of you'), el('p', lead)),
    s.state === 'purged' ? null : box,
    s.state === 'purged' ? null : el('div', null, { class: 'card' },
      el('span', 'Your choices', { class: 'label' }),
      el('button', 'Download a copy', { type: 'button', class: 'btn btn-secondary', onclick: download }),
      el('button', confirming ? 'Tap again: delete everything now' : 'Delete everything now', { type: 'button', class: 'btn btn-secondary', onclick: del }),
      s.hasAccess ? null : el('a', 'Come back to New Page', { class: 'btn btn-primary', href: '/newpage/join' }),
      message && el('p', message, { role: 'status', class: 'small' })))
}

async function download() {
  try {
    const { export: data } = await api('export')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'sky-memory.json'; document.body.append(a); a.click(); a.remove()
    message = 'Downloaded.'
  } catch (e) { message = e.message }
  show()
}
async function del() {
  if (!confirming) { confirming = true; message = 'This can’t be undone. Download a copy first if you want one.'; show(); return }
  try { await api('delete', { confirm: true }); message = ''; confirming = false } catch (e) { message = e.message }
  show()
}
show()
