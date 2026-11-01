// The demo's front door. One tap makes a 24-hour sample member and opens the app.
const $ = id => document.getElementById(id)
const KEY = 'np_app_session'
let needsCode = false

async function api(body) {
  const res = await fetch('/api/newpage/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { code: data.code })
  return data
}

async function init() {
  try { if (localStorage.getItem(KEY)) $('resume-note').hidden = false } catch {}
  try { const info = await api({ action: 'info' }); needsCode = !!info.needsCode; $('code-field').hidden = !needsCode } catch {}
  const code = new URL(location.href).searchParams.get('code')
  if (code) $('d-code').value = code
}

$('start-form').addEventListener('submit', async e => {
  e.preventDefault()
  const err = $('d-error'); err.hidden = true
  const btn = $('d-start'); btn.disabled = true; btn.textContent = 'Setting up your demo…'
  try {
    const d = await api({ action: 'start', code: $('d-code').value.trim(), website: $('d-website').value })
    try { localStorage.setItem(KEY, d.session); localStorage.setItem('np_sky_seen', '') ; localStorage.removeItem('np_sky_seen') } catch {}
    location.href = '/newpage/app#today'
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false
    if (ex.code === 'code') { $('code-field').hidden = false; $('d-code').focus() }
    btn.disabled = false; btn.textContent = 'Start the demo'
  }
})
init()
