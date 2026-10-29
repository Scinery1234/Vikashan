// New Page admin: sign in with the Vikashan admin login, then send the
// launch email in batches.
const $ = id => document.getElementById(id)
let token = null
try { token = sessionStorage.getItem('np_admin_token') } catch {}

async function api(method, body, url = '/api/newpage/launch') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) { signOut(); throw new Error('Please sign in again.') }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

function signOut() {
  token = null
  try { sessionStorage.removeItem('np_admin_token') } catch {}
  $('members').hidden = true
  $('codes').hidden = true
  $('launch').hidden = true
  $('login').hidden = false
}

async function showLaunch() {
  $('login').hidden = true
  $('launch').hidden = false
  $('members').hidden = false
  $('codes').hidden = false
  loadMembers()
  loadCodes()
  try { $('waiting').textContent = (await api('GET')).waiting } catch (e) { $('status').textContent = e.message }
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault()
  $('login-error').hidden = true
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: $('ad-email').value.trim(), password: $('ad-pass').value })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.token) {
    $('login-error').textContent = data.error || 'Sign in failed.'
    $('login-error').hidden = false
    return
  }
  token = data.token
  try { sessionStorage.setItem('np_admin_token', token) } catch {}
  showLaunch()
})

$('test-btn').addEventListener('click', async () => {
  $('status').textContent = 'Sending a test…'
  try { await api('POST', { mode: 'test', checkoutUrl: $('checkout').value.trim() || null }); $('status').textContent = 'Test sent to your admin email.' }
  catch (e) { $('status').textContent = e.message }
})

$('send-btn').addEventListener('click', () => {
  $('confirm-n').textContent = $('waiting').textContent
  $('confirm').hidden = false
})
$('confirm-no').addEventListener('click', () => { $('confirm').hidden = true })

$('confirm-yes').addEventListener('click', async () => {
  $('confirm').hidden = true
  $('send-btn').disabled = true
  let total = 0, failed = 0
  try {
    for (;;) {
      const r = await api('POST', { mode: 'send', checkoutUrl: $('checkout').value.trim() || null })
      total += r.sent; failed += r.failed
      $('status').textContent = `Sent ${total}${failed ? `, ${failed} failed` : ''}. ${r.remaining} to go…`
      if (r.remaining === 0 || r.sent === 0) break
    }
    $('status').textContent = `Done. Sent ${total}${failed ? `, ${failed} failed (they’ll be included if you send again)` : ''}.`
  } catch (e) {
    $('status').textContent = `Stopped: ${e.message} Sent ${total} so far. Sending again continues where it stopped.`
  }
  $('send-btn').disabled = false
  try { $('waiting').textContent = (await api('GET')).waiting } catch {}
})


// ── Members ──
const MEMBERS = '/api/newpage/members'
const el = (tag, text, attrs = {}, ...kids) => { const e = document.createElement(tag); if (text != null) e.textContent = text; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids.flat().filter(Boolean)); return e }

const fmtD = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const btn = (text, cls = 'btn btn-secondary') => el('button', text, { type: 'button', class: cls, style: 'min-height:44px;font-size:14px;padding:6px 12px' })

async function loadMembers() {
  const box = $('member-list')
  try {
    const { members, encryption } = await api('GET', null, MEMBERS)
    const warn = $('enc-warn'); if (warn) warn.hidden = encryption !== false
    box.replaceChildren()
    if (!members.length) { box.append(el('p', 'No members yet.', { class: 'muted small' })); return }
    const today = Date.now()
    for (const m of members) {
      const ended = m.access_until && new Date(m.access_until).getTime() < today
      const access = m.access_until ? (ended ? `ended ${fmtD(m.access_until)}` : `until ${fmtD(m.access_until)}`) : 'no end date'
      const row = el('div', null, { class: 'mrow' })
      const who = el('div', null, { class: 'mwho' })
      who.append(el('b', m.name || m.email), el('span', m.name ? m.email : '', { class: 'small muted' }))
      const chips = el('div', null, { class: 'mchips' })
      for (const t of [m.quadrant || 'no plan yet', `access ${access}`, `session ${m.sessions_used}/${m.sessions_included ?? 1}`, m.status !== 'active' ? m.status.toUpperCase() : '', m.memory_state && m.memory_state !== 'active' ? `memory ${m.memory_state === 'trash' ? 'in the Trash' : 'deleted'}` : '', m.last_login_at ? '' : 'never signed in']) if (t) chips.append(el('span', t, { class: 'mchip' + (t === m.status.toUpperCase() ? ' warn' : '') }))
      const open = btn('Open', 'btn btn-primary')
      open.addEventListener('click', () => openMember(m.id))
      row.append(who, chips, open)
      box.append(row)
    }
  } catch (e) { box.replaceChildren(el('p', e.message, { class: 'error' })) }
}

// ── One member: the coach panel ──
let panel = null
function closePanel() { panel?.remove(); panel = null; document.body.style.overflow = '' }

async function openMember(id) {
  closePanel()
  const wrap = el('div', null, { class: 'mp-wrap' })
  wrap.append(el('div', null, { class: 'mp-back' }))
  wrap.firstChild.addEventListener('click', closePanel)
  const aside = el('aside', null, { class: 'mp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Member' })
  wrap.append(aside)
  document.body.append(wrap); panel = wrap; document.body.style.overflow = 'hidden'
  aside.append(el('p', 'Loading…', { class: 'muted' }))
  const onKey = e => { if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', onKey) } }
  document.addEventListener('keydown', onKey)
  try { await renderMember(aside, id) } catch (e) { aside.replaceChildren(el('p', e.message, { class: 'error' })) }
}

async function renderMember(aside, id, msg = '') {
  const d = await api('GET', null, `${MEMBERS}?detail=${id}`)
  const m = d.member
  const head = el('div', null, { class: 'mp-head' })
  const title = el('div'); title.append(el('h3', m.name || m.email), el('p', `${m.email}${m.name ? '' : ''}`, { class: 'small muted' }))
  const close = el('button', '×', { type: 'button', class: 'mp-x', 'aria-label': 'Close' }); close.addEventListener('click', closePanel)
  head.append(title, close)

  // Where they are
  const c = d.checkins[0]
  const where = el('div', null, { class: 'card' })
  where.append(el('span', 'Where they are', { class: 'label' }),
    el('p', m.quadrant ? `Plan: ${m.quadrant}. ${d.position.complete ? 'Finished the four weeks.' : `Week ${d.position.week}, day ${d.position.day}.`} ${d.stepsDone} program steps ticked off.` : 'No plan yet: they haven’t done the check-in.'),
    el('p', c ? `Latest check-in: clarity ${c.clarity}/16, capacity ${c.capacity}/16 (${c.quadrant}) on ${fmtD(c.created_at)}.` : 'No check-ins yet.', { class: 'small' }),
    el('p', `Last signed in: ${m.last_login_at ? fmtD(m.last_login_at) : 'never'}. Access: ${m.access_until ? 'until ' + fmtD(m.access_until) : 'no end date'}. Sessions: ${m.sessions_included ?? 1} included.`, { class: 'small muted' }))
  if (d.goals.length) { const ul = el('ul', null, { class: 'small' }); for (const g of d.goals) ul.append(el('li', `${g.done ? '✓ ' : ''}${g.title}${g.target ? ' (by ' + g.target + ')' : ''}`)); where.append(el('span', 'Their goals', { class: 'label' }), ul) }

  // Sky's memory: only what the member has let Vik see
  const pv = d.privacy
  const LEVEL = { private: 'Nothing: they keep their chats private', share: 'Only what they choose to share', all: 'All their chats' }
  const mem = el('div', null, { class: 'card' })
  mem.append(el('span', 'Sky memory and privacy', { class: 'label' }),
    el('p', `They let you see: ${pv.level ? LEVEL[pv.level] : 'nothing yet (they haven’t chosen)'}.`),
    el('p', pv.encryption ? 'Stored encrypted.' : 'Private storage isn’t set up, so nothing can be shared with you yet.', { class: 'small muted' }))
  if (pv.memoryState === 'trash') mem.append(el('p', `Their memory is in the Trash${pv.deleteOn ? ` and is permanently deleted on ${fmtD(pv.deleteOn)}` : ''}. You can’t see it.`, { class: 'small' }))
  else if (pv.trashOn) mem.append(el('p', `Their membership ended. Their memory moves to the Trash on ${fmtD(pv.trashOn)}.`, { class: 'small' }))
  const msgs = (arr, who) => { const ul = el('div', null, { class: 'mp-chat' }); for (const x of arr) ul.append(el('p', `${x.role === 'user' ? who : 'Sky'}${x.focus ? ' (' + x.focus + ')' : ''}: ${x.content}`, { class: x.role === 'user' ? 'me' : '' })); return ul }
  for (const sh of pv.shares) {
    const det = el('details', null, { class: 'mp-share' }, el('summary', `${sh.kind === 'chat' ? 'A chat' : 'Their context'} · shared ${fmtD(sh.at)}${sh.content.note ? ' · “' + sh.content.note.slice(0, 60) + '”' : ''}`))
    if (sh.kind === 'chat') det.append(msgs(sh.content.messages || [], m.name || 'Them'))
    else {
      for (const [k, v] of Object.entries(sh.content.about || {})) det.append(el('p', `${k}: ${v}`, { class: 'small' }))
      if ((sh.content.notes || []).length) { det.append(el('b', 'Notes Sky keeps')); const ul = el('ul'); for (const n of sh.content.notes) ul.append(el('li', n)); det.append(ul) }
      if (sh.content.resume) det.append(el('details', null, {}, el('summary', 'Their resume'), el('pre', sh.content.resume, { class: 'mp-pre' })))
    }
    mem.append(det)
  }
  if (pv.chats) {
    const det = el('details', null, { class: 'mp-share' }, el('summary', `Their chats and what Sky has learned (${pv.chats.messages.length} messages)`))
    det.append(msgs(pv.chats.messages, m.name || 'Them'))
    if (pv.chats.notes.length) { det.append(el('b', 'Notes Sky keeps')); const ul = el('ul'); for (const n of pv.chats.notes) ul.append(el('li', n)); det.append(ul) }
    for (const [k, v] of Object.entries(pv.chats.about)) det.append(el('p', `${k}: ${v}`, { class: 'small' }))
    if (pv.chats.resume) det.append(el('details', null, {}, el('summary', 'Their resume'), el('pre', pv.chats.resume, { class: 'mp-pre' })))
    mem.append(det)
  }
  if (!pv.shares.length && !pv.chats) mem.append(el('p', 'Nothing has been shared with you.', { class: 'small muted' }))
  mem.append(el('p', 'Each time you open something here, it’s noted in the member’s own privacy log.', { class: 'small muted' }))

  // Add a task for them
  const add = el('form', null, { class: 'card', novalidate: '' })
  const tIn = el('input', null, { type: 'text', maxlength: '200', id: 'mp-title', placeholder: 'e.g. Ring two recruiters and note what they say' })
  const dIn = el('input', null, { type: 'date', id: 'mp-due', 'aria-label': 'Due date' })
  const sIn = el('input', null, { type: 'time', id: 'mp-start', 'aria-label': 'Start time' })
  const mIn = el('select', null, { id: 'mp-mins', 'aria-label': 'Length' })
  for (const n of [15, 30, 45, 60, 90, 120]) { const o = el('option', `${n} min`, { value: String(n) }); if (n === 30) o.selected = true; mIn.append(o) }
  const noteIn = el('textarea', null, { id: 'mp-note', rows: '2', maxlength: '500', placeholder: 'A short note for them (optional, goes in the email)' })
  const notify = el('input', null, { type: 'checkbox', id: 'mp-notify', checked: '' })
  const status = el('p', msg, { role: 'status', class: 'small' })
  const go = el('button', 'Add to their list', { type: 'submit', class: 'btn btn-primary' })
  const row = (label, input) => { const f = el('div', null, { class: 'field' }); const l = el('label', label, { for: input.id }); f.append(l, input); return f }
  const when = el('div', null, { class: 'mp-when' }); when.append(row('Date', dIn), row('Time (optional)', sIn), row('Length', mIn))
  const chk = el('label', null, { class: 'check', for: 'mp-notify' }); chk.append(notify, el('span', 'Email them about it'))
  add.append(el('span', 'Add a task for them', { class: 'label' }), row('Task', tIn), when, noteIn, chk, go, status)
  add.addEventListener('submit', async e => {
    e.preventDefault(); status.textContent = ''
    go.disabled = true
    try {
      const r = await api('POST', { id, addTask: { title: tIn.value, due: dIn.value || null, start: sIn.value || null, mins: mIn.value, notify: notify.checked, note: noteIn.value } }, MEMBERS)
      await renderMember(aside, id, `Added${dIn.value ? ' and scheduled' : ''}.${notify.checked ? (r.emailed ? ' Email sent.' : ` The email didn’t send (${r.emailError || 'unknown reason'}), but the task is on their list.`) : ''}`)
      return
    } catch (err) { status.textContent = err.message; status.className = 'small error' }
    go.disabled = false
  })

  // Their tasks
  const tasks = el('div', null, { class: 'card' })
  tasks.append(el('span', `Their tasks (${d.tasks.filter(t => !t.done).length} open)`, { class: 'label' }))
  if (!d.tasks.length) tasks.append(el('p', 'None yet.', { class: 'small muted' }))
  for (const t of d.tasks) {
    const r = el('div', null, { class: 'mp-task' + (t.done ? ' done' : '') })
    const when = [t.due ? fmtD(t.due) : '', t.block_start ? t.block_start.slice(0, 5) + (t.block_mins ? ` (${t.block_mins} min)` : '') : ''].filter(Boolean).join(' · ')
    r.append(el('span', `${t.done ? '✓ ' : ''}${t.title}`), el('small', [when, t.source === 'vik' ? 'from you' : t.source === 'coach' ? 'from Sky' : t.source === 'compass' ? 'Compass' : ''].filter(Boolean).join(' · '), { class: 'muted' }))
    if (t.source === 'vik') {
      const x = el('button', '×', { type: 'button', class: 'mp-x', 'aria-label': `Remove ${t.title}` })
      x.addEventListener('click', async () => { try { await api('POST', { id, deleteTask: t.id }, MEMBERS); await renderMember(aside, id) } catch (err) { alert(err.message) } })
      r.append(x)
    }
    tasks.append(r)
  }

  // Private notes
  const notes = el('div', null, { class: 'card' })
  const nIn = el('textarea', m.coach_notes || '', { rows: '5', maxlength: '10000', id: 'mp-notes', 'aria-label': 'Your private notes' })
  const nSave = btn('Save notes'); const nStat = el('span', '', { class: 'small muted', role: 'status' })
  nSave.addEventListener('click', async () => { try { await api('POST', { id, coachNotes: nIn.value }, MEMBERS); nStat.textContent = 'Saved.' } catch (err) { nStat.textContent = err.message } })
  notes.append(el('span', 'Your private notes', { class: 'label' }), el('p', 'Only you can see these. They never show in the member’s app.', { class: 'small muted' }), nIn, el('div', null, { class: 'row' }))
  notes.lastChild.append(nSave, nStat)

  // Account actions
  const acct = el('div', null, { class: 'card' })
  const sel = el('select', null, { 'aria-label': 'Status', style: 'min-height:44px;border:1.5px solid #C9D3E3;border-radius:10px;padding:6px 8px;background:#fff;font-size:15px' })
  for (const v of ['active', 'paused', 'ended']) { const o = el('option', v, { value: v }); if (v === m.status) o.selected = true; sel.append(o) }
  sel.addEventListener('change', async () => { try { await api('POST', { id, status: sel.value }, MEMBERS) } catch (e) { alert(e.message) } loadMembers(); renderMember(aside, id) })
  const renew = btn('Renewal paid: +1 month')
  renew.addEventListener('click', async () => { if (!confirm(`Add one month and one more session for ${m.email}? Only do this once they have paid for the renewal.`)) return; try { await api('POST', { id, renew: true }, MEMBERS) } catch (e) { alert(e.message) } loadMembers(); renderMember(aside, id) })
  const date = btn('Set end date')
  date.addEventListener('click', async () => { const v = prompt('Access ends on (YYYY-MM-DD), or leave blank for no end date:', m.access_until ? m.access_until.slice(0, 10) : ''); if (v === null) return; try { await api('POST', { id, accessUntil: v.trim() || null }, MEMBERS) } catch (e) { alert(e.message) } loadMembers(); renderMember(aside, id) })
  const more = btn('+1 session')
  more.addEventListener('click', async () => { try { await api('POST', { id, sessionsIncluded: (m.sessions_included ?? 1) + 1 }, MEMBERS) } catch (e) { alert(e.message) } loadMembers(); renderMember(aside, id) })
  const brief = btn('View session brief')
  brief.addEventListener('click', async () => {
    try {
      const { member, brief: b } = await api('GET', null, `${MEMBERS}?brief=${id}`)
      const view = $('brief-view'); view.replaceChildren()
      view.append(el('span', `Session brief: ${member?.name || member?.email || ''}`, { class: 'label' }))
      if (!b) view.append(el('p', 'No brief yet.')); else {
        const cc = b.content
        view.append(el('h3', cc.title || b.title), el('p', `Written ${new Date(b.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`, { class: 'small muted' }))
        for (const sct of cc.sections || []) {
          view.append(el('h4', sct.heading))
          for (const p of sct.paragraphs || []) view.append(el('p', p))
          if ((sct.bullets || []).length) { const ul = el('ul'); for (const x of sct.bullets) ul.append(el('li', x)); view.append(ul) }
        }
      }
      view.hidden = false; closePanel(); view.scrollIntoView({ block: 'start' })
    } catch (e) { alert(e.message) }
  })
  const erase = btn('Delete Sky memory now')
  erase.addEventListener('click', async () => { if (!confirm(`Permanently delete everything Sky holds for ${m.email}: chats, notes, resume, answers and shares? This can’t be undone. Use it for a deletion request.`)) return; try { await api('POST', { id, eraseMemory: true }, MEMBERS) } catch (e) { alert(e.message) } loadMembers(); renderMember(aside, id) })
  const arow = el('div', null, { class: 'row' }); arow.append(sel, renew, date, more, brief, erase)
  acct.append(el('span', 'Account', { class: 'label' }), arow)

  aside.replaceChildren(head, where, mem, add, tasks, notes, acct)
}

$('grant-form').addEventListener('submit', async e => {
  e.preventDefault()
  $('g-error').hidden = true
  $('g-status').textContent = ''
  const email = $('g-email').value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('g-error').textContent = 'Enter a valid email.'; $('g-error').hidden = false; return }
  try {
    const r = await api('POST', { email, name: $('g-name').value.trim(), source: $('g-source').value, welcome: $('g-welcome').checked, access: $('g-access').value }, MEMBERS)
    $('g-status').textContent = `${r.restored ? 'Access restored' : 'Access given'}${r.quadrant ? ` (plan: ${r.quadrant})` : ' (no quiz result yet, so they start with the check-in)'}${r.welcomeSent ? ', welcome email sent.' : r.welcomeSent === false && $('g-welcome').checked ? ', but the welcome email failed to send.' : '.'}`
    $('g-email').value = ''; $('g-name').value = ''
    loadMembers()
  } catch (err) { $('g-error').textContent = err.message; $('g-error').hidden = false }
})

// ── Scholarship codes ──
const CODES = '/api/newpage/codes'
async function loadCodes(more) {
  const box = $('code-list')
  try {
    const { codes } = await api(more ? 'POST' : 'GET', more ? { action: 'more' } : null, CODES)
    box.replaceChildren()
    const free = codes.filter(c => !c.used_at).length
    box.append(el('p', `${free} unused · ${codes.length - free} used`, { class: 'small muted' }))
    for (const c of codes) {
      const row = el('div', null, { class: 'mem' })
      const info = el('span', `${c.code} · ${c.used_at ? 'used by ' + c.used_by_email + ' on ' + new Date(c.used_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'unused'}`)
      if (c.used_at) info.style.color = '#56607A'
      row.append(info)
      if (!c.used_at) {
        const copy = el('button', 'Copy link', { type: 'button', class: 'btn btn-secondary', style: 'min-height:44px;font-size:14px;padding:6px 12px' })
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}/newpage/join?code=${c.code}`); copy.textContent = 'Copied' } catch { copy.textContent = 'Couldn’t copy' } setTimeout(() => { copy.textContent = 'Copy link' }, 1500) })
        row.append(copy)
      }
      box.append(row)
    }
  } catch (e) { box.replaceChildren(el('p', e.message, { class: 'error' })) }
}
$('more-codes').addEventListener('click', () => loadCodes(true))

if (token) showLaunch()
