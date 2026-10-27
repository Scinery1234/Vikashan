// Joining New Page: pay by card (Stripe) or use a scholarship code.
// Prices shown here are only for display. The server works out what you're charged.
const $ = id => document.getElementById(id)
const PRICE = { program: 500, hour: 250, max: 8 }
const S = { hours: 0, code: null, codeOk: false, busy: false }
const money = n => `$${n.toLocaleString('en-AU')}`
const text = (el, t) => { el.textContent = t }

function render() {
  const total = S.codeOk ? 0 : PRICE.program + S.hours * PRICE.hour
  const box = $('summary'); box.replaceChildren()
  const row = (l, r, cls) => { const d = document.createElement('div'); d.className = 'sum ' + (cls || ''); const a = document.createElement('span'), b = document.createElement('span'); a.textContent = l; b.textContent = r; d.append(a, b); box.append(d) }
  row('New Page: 4 weeks, with a 60-minute session with Vik', S.codeOk ? '$0' : money(PRICE.program))
  if (S.hours > 0 && !S.codeOk) row(`${S.hours} extra hour${S.hours === 1 ? '' : 's'} with Vik`, money(S.hours * PRICE.hour))
  if (S.codeOk) row('Scholarship', 'covered')
  row('Total', money(total), 'total')
  text($('h-val'), String(S.hours))
  $('h-minus').disabled = S.hours <= 0 || S.codeOk
  $('h-plus').disabled = S.hours >= PRICE.max || S.codeOk
  text($('j-submit'), S.busy ? 'One moment…' : S.codeOk ? 'Join with my scholarship' : `Pay ${money(total)} and start`)
  $('j-submit').disabled = S.busy
}

async function post(body) {
  const res = await fetch('/api/newpage/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.code = data.code; throw e }
  return data
}

$('h-minus').addEventListener('click', () => { S.hours = Math.max(0, S.hours - 1); render() })
$('h-plus').addEventListener('click', () => { S.hours = Math.min(PRICE.max, S.hours + 1); render() })

$('code-apply').addEventListener('click', async () => {
  const code = $('j-code').value.trim()
  const msg = $('code-msg')
  if (!code) { S.codeOk = false; S.code = null; text(msg, ''); render(); return }
  try {
    const q = await post({ action: 'quote', hours: 0, code })
    S.codeOk = !!q.scholarship; S.code = code; S.hours = 0
    text(msg, 'Scholarship applied. Your four weeks and your session with Vik are covered.')
    msg.style.color = '#1d6b3a'
  } catch (e) { S.codeOk = false; S.code = null; text(msg, e.message); msg.style.color = '#B3261E' }
  render()
})

$('join-form').addEventListener('submit', async e => {
  e.preventDefault()
  const err = $('j-error'); err.hidden = true
  const name = $('j-name').value.trim(), email = $('j-email').value.trim()
  if (!name) { text(err, 'Add your name.'); err.hidden = false; $('j-name').focus(); return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { text(err, 'Add the email you want to use for New Page.'); err.hidden = false; $('j-email').focus(); return }
  S.busy = true; render()
  try {
    const d = await post({ action: 'start', name, email, hours: S.hours, code: S.codeOk ? S.code : undefined, website: $('j-website').value })
    if (d.joined) { showDone(true, email); return }
    if (d.url) { location.href = d.url; return }
    throw new Error('Something went wrong. Please try again.')
  } catch (e2) { text(err, e2.message); err.hidden = false }
  S.busy = false; render()
})

function showDone(scholarship, email) {
  $('form-screen').hidden = true; $('cancel-screen').hidden = true; $('done-screen').hidden = false
  text($('done-title'), 'You’re in.')
  text($('done-text'), scholarship
    ? `Your scholarship is confirmed. A welcome email is on its way to ${email}. Open it, or go straight to New Page and sign in with that email to get your sign-in link.`
    : 'Thank you. Your payment is done and your welcome email is on its way. Go to New Page and sign in with the email you used, and we’ll send you a sign-in link.')
  window.scrollTo({ top: 0 })
}

const q = new URLSearchParams(location.search)
if (q.get('done')) showDone(false)
else if (q.get('cancelled')) { $('form-screen').hidden = true; $('cancel-screen').hidden = false }
$('cancel-back').addEventListener('click', () => { $('cancel-screen').hidden = true; $('form-screen').hidden = false })
const pre = q.get('code'); if (pre) { $('j-code').value = pre; $('code-apply').click() }
render()
