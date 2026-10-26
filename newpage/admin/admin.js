// New Page admin: sign in with the Vikashan admin login, then send the
// launch email in batches.
const $ = id => document.getElementById(id)
let token = null
try { token = sessionStorage.getItem('np_admin_token') } catch {}

async function api(method, body) {
  const res = await fetch('/api/newpage/launch', {
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
  $('launch').hidden = true
  $('login').hidden = false
}

async function showLaunch() {
  $('login').hidden = true
  $('launch').hidden = false
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

if (token) showLaunch()
