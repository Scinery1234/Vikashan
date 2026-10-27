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
const el = (tag, text, attrs = {}) => { const e = document.createElement(tag); if (text != null) e.textContent = text; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e }

async function loadMembers() {
  const box = $('member-list')
  try {
    const { members } = await api('GET', null, MEMBERS)
    box.replaceChildren()
    if (!members.length) { box.append(el('p', 'No members yet.', { class: 'muted small' })); return }
    const today = Date.now()
    const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    for (const m of members) {
      const ended = m.access_until && new Date(m.access_until).getTime() < today
      const row = el('div', null, { class: 'mem' })
      const access = m.access_until ? (ended ? `access ended ${fmt(m.access_until)}` : `access until ${fmt(m.access_until)}`) : 'no end date'
      const info = el('span', `${m.name || m.email}${m.name ? ' · ' + m.email : ''} · ${m.quadrant || 'no plan yet'} · ${m.source} · ${access} · session ${m.sessions_used}/${m.sessions_included ?? 1}${m.status !== 'active' ? ' · ' + m.status.toUpperCase() : ''}${m.last_login_at ? '' : ' · never signed in'}`)
      const sel = el('select', null, { 'aria-label': `Status for ${m.email}`, style: 'min-height:44px;border:1.5px solid #C9D3E3;border-radius:10px;padding:6px 8px;background:#fff;font-size:15px' })
      for (const s of ['active', 'paused', 'ended']) { const o = el('option', s, { value: s }); if (s === m.status) o.selected = true; sel.append(o) }
      sel.addEventListener('change', async () => {
        try { await api('POST', { id: m.id, status: sel.value }, MEMBERS) } catch (e) { alert(e.message) }
        loadMembers()
      })
      const renew = el('button', 'Renewal paid: +1 month', { type: 'button', class: 'btn btn-secondary', style: 'min-height:44px;font-size:14px;padding:6px 12px' })
      renew.addEventListener('click', async () => {
        if (!confirm(`Add one month and one more session for ${m.email}? Only do this once they have paid for the renewal.`)) return
        try { await api('POST', { id: m.id, renew: true }, MEMBERS) } catch (e) { alert(e.message) }
        loadMembers()
      })
      const date = el('button', 'Set end date', { type: 'button', class: 'btn btn-secondary', style: 'min-height:44px;font-size:14px;padding:6px 12px' })
      date.addEventListener('click', async () => {
        const v = prompt('Access ends on (YYYY-MM-DD), or leave blank for no end date:', m.access_until ? m.access_until.slice(0, 10) : '')
        if (v === null) return
        try { await api('POST', { id: m.id, accessUntil: v.trim() || null }, MEMBERS) } catch (e) { alert(e.message) }
        loadMembers()
      })
      const more = el('button', '+1 session', { type: 'button', class: 'btn btn-secondary', style: 'min-height:44px;font-size:14px;padding:6px 12px' })
      more.addEventListener('click', async () => {
        try { await api('POST', { id: m.id, sessionsIncluded: (m.sessions_included ?? 1) + 1 }, MEMBERS) } catch (e) { alert(e.message) }
        loadMembers()
      })
      row.append(info, sel, renew, date, more)
      if (m.has_brief) {
        const brief = el('button', 'Session brief', { type: 'button', class: 'btn btn-secondary', style: 'min-height:44px;font-size:14px;padding:6px 12px' })
        brief.addEventListener('click', async () => {
          try {
            const { member, brief: b } = await api('GET', null, `${MEMBERS}?brief=${m.id}`)
            const view = $('brief-view'); view.replaceChildren()
            view.append(el('span', `Session brief: ${member?.name || member?.email || ''}`, { class: 'label' }))
            if (!b) { view.append(el('p', 'No brief yet.')) } else {
              const c = b.content
              view.append(el('h3', c.title || b.title))
              view.append(el('p', `Written ${new Date(b.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`, { class: 'small muted' }))
              for (const s of c.sections || []) {
                view.append(el('h4', s.heading))
                for (const p of s.paragraphs || []) view.append(el('p', p))
                if ((s.bullets || []).length) { const ul = el('ul'); for (const x of s.bullets) ul.append(el('li', x)); view.append(ul) }
              }
            }
            view.hidden = false; view.scrollIntoView({ block: 'start' })
          } catch (e) { alert(e.message) }
        })
        row.append(brief)
      }
      box.append(row)
    }
  } catch (e) { box.replaceChildren(el('p', e.message, { class: 'error' })) }
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
