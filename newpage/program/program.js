// "Tell me when it opens" form on the New Page program page.
const form = document.getElementById('wl-form')
const err = document.getElementById('wl-error')
const btn = document.getElementById('wl-submit')
const done = document.getElementById('wl-done')
const params = new URLSearchParams(location.search)

form.addEventListener('submit', async e => {
  e.preventDefault()
  const email = document.getElementById('wl-email').value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    err.textContent = 'Add your email so we can let you know.'
    err.hidden = false
    document.getElementById('wl-email').focus()
    return
  }
  err.hidden = true
  btn.disabled = true
  btn.textContent = 'Sending…'
  try {
    const res = await fetch('/api/newpage/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: document.getElementById('wl-name').value.trim(),
        website: document.getElementById('wl-website').value,
        source: {
          utm_source: params.get('utm_source'), utm_medium: params.get('utm_medium'),
          utm_campaign: params.get('utm_campaign'), ref: document.referrer ? new URL(document.referrer).hostname : null
        }
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
    form.hidden = true
    done.hidden = false
    done.focus?.()
  } catch (e2) {
    err.textContent = e2.message
    err.hidden = false
    btn.disabled = false
    btn.textContent = 'Tell me when it opens'
  }
})
