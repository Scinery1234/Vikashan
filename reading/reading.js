// Career Reading pages: questions, birth details, the sealed cast and the
// question; then payment, progress and the finished reading. Plain JS, no build.
// Routes: /  ·  /r/<id>  ·  /sample   (under /reading on the main domain)
import { COMPASS, COMPASS_SCALE, STATEMENTS, LIKE, SITUATIONS, WELLBEING, asksSatisfaction } from './shared/quiz.js'
import { detectCrisis } from './shared/safety.js'

const BASE = location.hostname.startsWith('reading.') ? '' : '/reading'
const $ = s => document.querySelector(s)
const screen = $('#screen'), page = $('#page')
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const store = {
  get(k, area = sessionStorage) { try { return JSON.parse(area.getItem('reading:' + k)) } catch { return null } },
  set(k, v, area = sessionStorage) { try { area.setItem('reading:' + k, JSON.stringify(v)) } catch { /* storage off */ } },
  drop(k, area = sessionStorage) { try { area.removeItem('reading:' + k) } catch { /* storage off */ } }
}
const money = p => p ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100) : ''
const readingLink = id => location.origin + BASE + '/r/' + id
const back = () => '<div><button class="linkbtn" type="button" data-back>Back</button></div>'

// ── API ──────────────────────────────────────────────────────────────────────
class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code } }
async function api(op, { method = 'GET', id, q, body } = {}) {
  const qs = new URLSearchParams({ op, ...(id ? { id } : {}), ...(q ? { q } : {}) })
  let res
  try { res = await fetch('/api/reading?' + qs, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }) }
  catch { throw new ApiError(0, 'network') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error)
  return data
}
function errorText(err) {
  const code = err && err.code
  const known = {
    payments_off: "Payments aren't switched on yet.", question_too_short: 'Write your question in a sentence or two.',
    invalid_email: "That email address doesn't look right.", 'invalid birth name': 'Enter your full name at birth.',
    'invalid date': 'Check your birth date.', 'invalid time': 'Check your birth time.',
    'invalid timezone': 'Choose your birth place from the list.', 'invalid location': 'Choose your birth place from the list.',
    already_submitted: 'This reading has already been sent. Open it from its link.', network: "Couldn't reach the site. Check your connection and try again."
  }
  if (known[code]) return known[code]
  if (err && err.status === 429) return 'Too many tries in a short time. Wait a few minutes and try again.'
  return 'Something went wrong. Try again in a moment.'
}

// ── Routing ──────────────────────────────────────────────────────────────────
function route() {
  const rest = location.pathname.slice(BASE.length).replace(/\/+$/, '')
  const m = /^\/r\/([0-9a-f-]{36})$/i.exec(rest)
  page.classList.remove('wide')
  if (m) return readingPage(m[1])
  if (rest === '/sample') return samplePage()
  return intake()
}
function nav(path) { history.pushState(null, '', BASE + path || '/'); scrollTo(0, 0); route() }
addEventListener('popstate', route)
$('#home').href = BASE || '/'
$('#home').onclick = e => { e.preventDefault(); store.drop('screen'); nav('') }

// ── The questions ────────────────────────────────────────────────────────────
const EMPTY = () => ({ compass: {}, statements: Array(8).fill(null), situation: null, satisfied: null, wellbeing: null,
  birth: { birthName: '', name: '', date: '', time: '12:00', timeUnknown: false, place: null }, cast: null, question: '', email: '' })
let S = store.get('intake') || EMPTY()
let price = null
const save = sc => { store.set('intake', S); if (sc) store.set('screen', sc) }
const steps = () => [
  ...COMPASS.map((q, n) => ({ kind: 'compass', q, n, part: 'How you like to work' })),
  ...STATEMENTS.map((q, n) => ({ kind: 'statement', q, n, part: "Where you're at" })),
  { kind: 'situation', part: 'Your situation' },
  ...(asksSatisfaction(S.situation) ? [{ kind: 'satisfied', part: 'Your situation' }] : []),
  { kind: 'wellbeing', part: "How you've been" }
]

function intake() {
  api('config').then(c => { price = c.price; const p = $('#price'); if (p && price) p.innerHTML = `<b>${money(price)}</b> <span class="muted">for the full reading, paid once after your question. Answering the questions is free.</span>` }).catch(() => {})
  const sc = store.get('screen')
  if (sc && sc.name && sc.name !== 'start') return show(sc)
  start()
}
function show(sc) {
  save(sc); scrollTo(0, 0)
  if (sc.name === 'q') return question(sc.i)
  if (sc.name === 'support') return support(sc)
  if (sc.name === 'birth') return birth()
  if (sc.name === 'cast') return cast()
  if (sc.name === 'ask') return ask(sc)
  return start()
}

function start() {
  save({ name: 'start' })
  screen.innerHTML = `<section class="stack" style="gap:26px">
    <div class="stack" style="gap:12px"><span class="label">Career Reading</span><span class="note">about 8 minutes</span>
    <h1>Your career, read <span class="hl">five ways</span>.</h1></div>
    <p>A long, personal reading about your work: how you like to work and where you're at right now, a draw cast before you ask your question, five birth charts read for your career, the next 30 days, and a 4-week plan made for you.</p>
    <ul class="ticks">
      <li>22 quick questions about how you work and how you're going</li>
      <li>Your full name at birth, and your birth date, time and place</li>
      <li>An I Ching and Tarot draw, cast and sealed before you type your question</li>
      <li>Natal and Vedic astrology, Human Design, Gene Keys and Numerology, each read on its own</li>
      <li>Your question answered, and a tailored 4-week plan, ready in about five minutes</li>
    </ul>
    <p id="price">${price ? `<b>${money(price)}</b> <span class="muted">for the full reading, paid once after your question. Answering the questions is free.</span>` : ''}</p>
    <div class="row"><button class="btn" type="button" id="go">Let's start</button><button class="linkbtn" type="button" id="sample">See a sample reading</button></div>
    <p class="small muted">There are no right answers. Go with your first instinct. For people 18 and over. This is coaching, not therapy. If you're going through a hard time, <button class="linkbtn inline" type="button" id="sup">support is available any time</button>.</p>
  </section>`
  $('#go').onclick = () => { S = EMPTY(); show({ name: 'q', i: 0 }) }
  $('#sample').onclick = () => nav('/sample')
  $('#sup').onclick = () => show({ name: 'support' })
}

function nextQuestion(i) {
  const all = steps()
  if (i >= all.length) return show(S.wellbeing === 4 ? { name: 'support', fromQuiz: true } : { name: 'birth' })
  show({ name: 'q', i })
}

function question(i) {
  const all = steps(), st = all[Math.min(i, all.length - 1)]
  let body
  if (st.kind === 'compass') {
    const val = S.compass[st.q.id], sizes = [34, 26, 18, 26, 34]
    body = `<h2 style="font-size:24px">Which is more like you?</h2>
      <div class="pair"><div><span class="label">Left</span><br>${esc(st.q.left)}</div><div><span class="label">Right</span><br>${esc(st.q.right)}</div></div>
      <div class="scale" role="radiogroup" aria-label="Where you sit between the two">${COMPASS_SCALE.map((t, k) => `<button class="dot${val === k - 2 ? ' on' : ''}" type="button" role="radio" aria-checked="${val === k - 2}" data-v="${k - 2}"><i style="width:${sizes[k]}px;height:${sizes[k]}px"></i>${esc(t)}</button>`).join('')}</div>
      <p class="hint">Answer for how you naturally prefer to work, not how you have to right now.</p>`
  } else {
    const opts = st.kind === 'situation' ? SITUATIONS : st.kind === 'wellbeing' ? WELLBEING : LIKE
    const offset = st.kind === 'statement' || st.kind === 'satisfied' ? 1 : 0
    const cur = st.kind === 'statement' ? S.statements[st.n] : S[st.kind]
    const title = st.kind === 'statement' ? st.q.text : st.kind === 'situation' ? 'Which fits you best right now?'
      : st.kind === 'satisfied' ? "I'm satisfied with my job." : 'Over the last couple of weeks, how have you been feeling overall?'
    body = `${offset ? '<p class="label">How much is this like you right now?</p>' : ''}<h2>${esc(title)}</h2>
      <div class="answers">${opts.map((t, k) => `<button class="ans${cur === k + offset ? ' on' : ''}" type="button" data-v="${k + offset}">${esc(t)}</button>`).join('')}</div>`
  }
  screen.innerHTML = `<div class="progress"><div class="bar" aria-hidden="true"><i style="width:${Math.round(i / all.length * 100)}%"></i></div><span>${i + 1} of ${all.length}</span></div>
    <section class="stack"><span class="label">${esc(st.part)}</span>${body}${back()}</section>`
  screen.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    const v = Number(b.dataset.v)
    if (st.kind === 'compass') S.compass[st.q.id] = v
    else if (st.kind === 'statement') S.statements[st.n] = v
    else if (st.kind === 'situation') { S.situation = v; if (!asksSatisfaction(v)) S.satisfied = null }
    else S[st.kind] = v
    b.classList.add('on'); save()
    setTimeout(() => nextQuestion(i + 1), 160)
  })
  screen.querySelector('[data-back]').onclick = () => i === 0 ? start() : show({ name: 'q', i: i - 1 })
}

function support(sc) {
  screen.innerHTML = `<section class="stack">
    <h2>Thanks for being honest.</h2>
    <p>It sounds like things are really hard right now. Your career can wait. Talking to someone today matters more.</p>
    <div class="support stack" style="gap:8px"><span>Lifeline: <b>13 11 14</b> (24/7)</span><span>Beyond Blue: <b>1300 22 4636</b></span>
      <span>13YARN: <b>13 92 76</b> (Aboriginal and Torres Strait Islander crisis support)</span><span>Emergency: <b>000</b></span></div>
    <div class="row">${sc.fromQuiz ? '<button class="btn" type="button" id="cont">Continue to my reading</button>' : ''}<button class="btn2" type="button" id="later">I'll come back later</button></div>
    ${sc.fromQuiz ? `<p class="small muted">If you continue, your reading won't include any New Page offers.</p>` : ''}
  </section>`
  if (sc.fromQuiz) $('#cont').onclick = () => show(sc.then || { name: 'birth' })
  $('#later').onclick = () => start()
}

function birth() {
  const b = S.birth
  screen.innerHTML = `<section class="stack">
    <span class="label">Your birth details</span><h2>Now, when and where it all started</h2>
    <p class="muted">Your charts are calculated from these. Numerology uses your full name at birth; the AI readings only ever see the resulting numbers.</p>
    <form class="stack" id="bf" novalidate>
      <div class="field"><label for="cbname">Full name at birth</label><input id="cbname" autocomplete="off" maxlength="100" value="${esc(b.birthName)}" placeholder="Every first, middle and last name you were given"></div>
      <div class="field"><label for="cname">Name you use now (optional)</label><input id="cname" maxlength="60" value="${esc(b.name)}" placeholder="If it's different"></div>
      <div class="two">
        <div class="field"><label for="cdate">Birth date</label><input id="cdate" type="date" value="${esc(b.date)}"></div>
        <div class="field"><label for="ctime">Birth time</label><input id="ctime" type="time" value="${esc(b.time)}" ${b.timeUnknown ? 'disabled' : ''}></div>
      </div>
      <label class="check"><input type="checkbox" id="ctunk" ${b.timeUnknown ? 'checked' : ''}> I don't know my birth time</label>
      <p class="hint" id="tunkhint" ${b.timeUnknown ? '' : 'hidden'}>We'll set your charts for midday and leave out what depends on the time: the rising signs, the houses and some timing.</p>
      <div class="field"><label for="cplace">Birth place</label>
        <input id="cplace" autocomplete="off" value="${esc(b.place ? b.place.label : '')}" placeholder="Start typing a town or city" role="combobox" aria-expanded="false" aria-controls="cplace-list">
        <div class="drop" id="cplace-list" role="listbox" hidden></div>
        <span class="hint" id="placehint"></span></div>
      <p class="err" id="berr" role="alert" hidden></p>
      <div class="row"><button class="btn" type="submit">Next: cast your draw</button></div>
    </form>${back()}</section>`
  let place = b.place
  const hint = $('#placehint'), drop = $('#cplace-list'), input = $('#cplace')
  const showHint = () => { hint.textContent = place ? `Timezone ${place.tz} · ${Math.abs(place.lat).toFixed(2)}°${place.lat < 0 ? 'S' : 'N'}, ${Math.abs(place.lon).toFixed(2)}°${place.lon < 0 ? 'W' : 'E'}` : "Any town of 1,000+ people. If yours isn't listed, pick the nearest one." }
  showHint()
  let list = [], active = -1, timer, req = 0
  const close = () => { drop.hidden = true; input.setAttribute('aria-expanded', 'false') }
  const render = msg => {
    drop.innerHTML = list.length ? list.map((p, i) => { const name = p.label.split(', ')[0]; return `<button type="button" role="option" data-i="${i}" class="${i === active ? 'on' : ''}" aria-selected="${i === active}"><b>${esc(name)}</b><span>${esc(p.label.slice(name.length))}</span></button>` }).join('') : `<p>${esc(msg)}</p>`
    drop.hidden = false; input.setAttribute('aria-expanded', String(!!list.length))
    drop.querySelectorAll('button').forEach(btn => btn.onmousedown = e => { e.preventDefault(); pick(list[Number(btn.dataset.i)]) })
  }
  const pick = p => { place = p; input.value = p.label; list = []; close(); showHint() }
  input.oninput = () => {
    place = null; showHint()
    const text = input.value.trim(); clearTimeout(timer)
    if (text.length < 2) { list = []; return close() }
    const id = ++req
    timer = setTimeout(() => {
      render('Searching places…')
      api('places', { q: text }).then(r => { if (id !== req) return; list = r; active = -1; render('No places match. Try a nearby town, or check the spelling.') })
        .catch(() => { if (id === req) { list = []; render("Couldn't search places just now. Try again in a moment.") } })
    }, 150)
  }
  input.onblur = () => setTimeout(close, 150)
  input.onkeydown = e => {
    if (!list.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; render() }
    else if (e.key === 'Enter') { e.preventDefault(); pick(list[Math.max(0, active)]) }
    else if (e.key === 'Escape') close()
  }
  $('#ctunk').onchange = e => { $('#ctime').disabled = e.target.checked; $('#tunkhint').hidden = !e.target.checked }
  $('#bf').onsubmit = e => {
    e.preventDefault()
    const nb = { birthName: $('#cbname').value.trim(), name: $('#cname').value.trim(), date: $('#cdate').value, time: $('#ctime').value || '12:00', timeUnknown: $('#ctunk').checked, place }
    const err = !/[a-z]/i.test(nb.birthName.normalize('NFD')) ? 'Enter your full name at birth.' : !nb.date ? 'Enter your birth date.' : !nb.place ? 'Choose your birth place from the list.' : null
    if (err) { const el = $('#berr'); el.textContent = err; el.hidden = false; return }
    S.birth = nb; show({ name: 'cast' })
  }
  screen.querySelector('[data-back]').onclick = () => show({ name: 'q', i: steps().length - 1 })
}

function cast() {
  screen.innerHTML = `<section class="stack">
    <span class="label">The cast</span><h2>We cast your draw <span class="hl">before</span> you ask.</h2>
    <p>Your I Ching hexagram and seven Tarot cards are drawn from this moment, then sealed. Your question comes next, so it can't steer the cards. You'll see them in your reading, so they can't steer your question either.</p>
    <div class="card seal"><div class="hexa" aria-hidden="true">${'<i></i>'.repeat(6)}</div>
      <div class="stack" style="gap:10px"><div class="cards7" aria-hidden="true">${'<span></span>'.repeat(7)}</div>
      <p class="small">${S.cast ? `Sealed at <b>${new Date(S.cast.castAt).toLocaleTimeString()}</b>.` : 'Not cast yet.'}</p></div></div>
    <p class="err" id="cerr" role="alert" hidden></p>
    <div class="row">${S.cast ? '<button class="btn" type="button" id="next">Next: your question</button>' : '<button class="btn" type="button" id="castbtn">Cast my draw</button>'}</div>
    ${back()}</section>`
  if (S.cast) $('#next').onclick = () => show({ name: 'ask' })
  else $('#castbtn').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Casting…'
    try { S.cast = await api('cast', { method: 'POST' }); save(); cast() }
    catch (err) { const el = $('#cerr'); el.textContent = errorText(err); el.hidden = false; e.target.disabled = false; e.target.textContent = 'Cast my draw' }
  }
  screen.querySelector('[data-back]').onclick = () => show({ name: 'birth' })
}

function ask(sc) {
  screen.innerHTML = `<section class="stack">
    <span class="label">Your question</span><h2>What do you want to know about your work?</h2>
    <form class="stack" id="qf" novalidate>
      <div class="field"><label for="cq">Your question</label>
        <textarea id="cq" maxlength="1200" placeholder="For example: should I leave my job this year to start my own practice, or push for a bigger role where I am first?">${esc(S.question)}</textarea>
        <span class="hint">Be specific. Name the decision, the options and any timing that matters.</span></div>
      <div class="field"><label for="cemail">Email me when it's ready (optional)</label>
        <input id="cemail" type="email" autocomplete="email" maxlength="254" value="${esc(S.email)}" placeholder="you@example.com">
        <span class="hint">We only use it to send you the link to your reading.</span></div>
      <p class="err" id="qerr" role="alert" hidden></p>
      <div class="row"><button class="btn" type="submit" id="send">${price ? `Pay ${money(price)} and make my reading` : 'Make my reading'}</button></div>
      ${price ? '<p class="small muted">Payment is handled by Stripe. Your reading starts as soon as it\'s paid.</p>' : ''}
    </form>${back()}</section>`
  const fail = msg => { const el = $('#qerr'); el.textContent = msg; el.hidden = false }
  $('#cq').oninput = e => { S.question = e.target.value; save() }
  $('#cemail').oninput = e => { S.email = e.target.value; save() }
  $('#qf').onsubmit = async e => {
    e.preventDefault()
    const text = S.question.trim()
    if (text.length < 10) return fail('Write your question in a sentence or two.')
    if (!(sc && sc.crisisOk) && detectCrisis(text)) return show({ name: 'support', fromQuiz: true, then: { name: 'ask', crisisOk: true } })
    const btn = $('#send'); btn.disabled = true; btn.textContent = 'Sending…'
    const b = S.birth
    try {
      const r = await api('submit', { method: 'POST', id: S.cast.id, body: {
        person: { birthName: b.birthName, name: b.name, date: b.date, time: b.time, timeUnknown: b.timeUnknown, place: b.place.label, tz: b.place.tz, lat: b.place.lat, lon: b.place.lon },
        answers: { compass: S.compass, statements: S.statements, situation: S.situation, satisfied: S.satisfied, wellbeing: S.wellbeing },
        question: text, email: S.email.trim()
      } })
      store.drop('intake'); store.drop('screen'); S = EMPTY()
      if (r.checkoutUrl) location.assign(r.checkoutUrl)
      else nav('/r/' + r.id)
    } catch (err) {
      btn.disabled = false; btn.textContent = price ? `Pay ${money(price)} and make my reading` : 'Make my reading'
      if (err.code === 'already_submitted' || err.status === 404) { S.cast = null; save(); return show({ name: 'cast' }) }
      fail(errorText(err))
    }
  }
  screen.querySelector('[data-back]').onclick = () => show({ name: 'cast' })
}

// ── A reading: payment, progress, the result ─────────────────────────────────
function copyLinkHTML(id) {
  return `<div class="stack" style="gap:6px"><span class="label">Your private link</span>
    <div class="copy"><code>${esc(readingLink(id))}</code><button class="btn2" type="button" data-copy="${esc(readingLink(id))}">Copy link</button></div>
    <span class="hint">Anyone with this link can open your reading, so keep it to yourself.</span></div>`
}
function wireCopy() {
  screen.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy)
    .then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy link' }, 2000) }, () => {}))
}
function stages(p) {
  const total = (p && p.total) || 202, done = (p && p.done) || 0
  const bounds = [['The draw, read card by card', 17], ['The draw applied to your question', 18], ['Your five charts, each on its own', total - 6], ['Across all five: profile, now, the month, your answer, your plan', total]]
  let prev = 0
  return bounds.map(([name, end]) => { const s = `<li class="${done >= end ? 'done' : done >= prev ? 'run' : ''}"><span class="st" aria-hidden="true"></span><span>${name}</span></li>`; prev = end; return s }).join('')
}

let pollTimer = null
function readingPage(id) {
  clearTimeout(pollTimer)
  const checkout = new URLSearchParams(location.search).get('checkout')
  const tick = async () => {
    let st
    try { st = await api('status', { id }) }
    catch (err) {
      if (err.status === 404) return notFound()
      screen.innerHTML = `<p class="muted">${esc(errorText(err))}</p>`
      pollTimer = setTimeout(tick, 5000); return
    }
    if (st.status === 'done') return report(st.report, id)
    renderState(id, st, checkout)
    if (st.status === 'queued' || st.status === 'running' || (st.status === 'awaiting_payment' && checkout === 'success')) pollTimer = setTimeout(tick, 2500)
  }
  screen.innerHTML = '<p class="muted">Opening your reading…</p>'
  tick()
}
function notFound() {
  screen.innerHTML = `<section class="stack"><h2>We can't find that reading</h2><p>Check the link, or start a new reading. Readings are kept for 90 days.</p><div><button class="btn" type="button" id="new">Start a reading</button></div></section>`
  $('#new').onclick = () => nav('')
}
function renderState(id, st, checkout) {
  if (st.status === 'cast') {
    screen.innerHTML = `<section class="stack"><h2>This reading wasn't finished</h2><p>The draw was cast, but the question never arrived. Start again to make your reading.</p><div><button class="btn" type="button" id="new">Start again</button></div></section>`
    return ($('#new').onclick = () => nav(''))
  }
  if (st.status === 'awaiting_payment') {
    if (checkout === 'success') { screen.innerHTML = `<section class="stack"><span class="note">thank you</span><h2>Confirming your payment…</h2><p class="muted">This usually takes a few seconds. Your reading starts as soon as Stripe confirms it.</p></section>`; return }
    screen.innerHTML = `<section class="stack"><span class="label">Almost there</span><h2>Your answers and question are in</h2>
      <p>${checkout === 'cancelled' ? "Payment was cancelled, so your reading hasn't started. " : ''}Pay once and your reading starts straight away. It takes about five minutes.</p>
      <p class="err" id="perr" role="alert" hidden></p><div class="row"><button class="btn" type="button" id="pay">Pay and make my reading</button></div></section>`
    api('config').then(c => { if (c.price) $('#pay').textContent = 'Pay ' + money(c.price) }).catch(() => {})
    $('#pay').onclick = async e => {
      e.target.disabled = true
      try { location.assign((await api('checkout', { method: 'POST', id })).url) }
      catch (err) { const el = $('#perr'); el.textContent = errorText(err); el.hidden = false; e.target.disabled = false }
    }
    return
  }
  if (st.status === 'failed') {
    screen.innerHTML = `<section class="stack"><h2>Your reading didn't finish</h2><p>Part of the writing failed, so we stopped rather than give you a reading with gaps. Your answers and the parts already written are kept. Try again, and if it fails twice, reply to your confirmation email or contact Vik with this link.</p>
      <p class="err" id="rerr" role="alert" hidden></p><div class="row"><button class="btn" type="button" id="retry">Try again</button></div>${copyLinkHTML(id)}</section>`
    wireCopy()
    $('#retry').onclick = async e => {
      e.target.disabled = true
      try { await api('retry', { method: 'POST', id }); readingPage(id) }
      catch (err) { const el = $('#rerr'); el.textContent = errorText(err); el.hidden = false; e.target.disabled = false }
    }
    return
  }
  const p = st.progress, pct = p && p.total ? Math.round(p.done / p.total * 100) : 0
  screen.innerHTML = `<section class="stack">
    <span class="note">writing it now</span><span class="label">Making your reading</span>
    <h2>${p ? `${p.done} of ${p.total} pieces written` : 'Starting your reading…'}</h2>
    <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Reading progress"><div class="bar"><i style="width:${pct}%"></i></div></div>
    <ul class="stages">${stages(p)}</ul>
    <p class="muted">Every section is written in its own request, from only what that section may see. It takes about five minutes. You can close this page: ${st.email ? "we'll email you the link when it's ready, and " : ''}the link below always opens your reading.</p>
    ${copyLinkHTML(id)}</section>`
  wireCopy()
}

async function samplePage() {
  screen.innerHTML = '<p class="muted">Opening the sample…</p>'
  try { report(await (await fetch('/reading/sample.md')).text(), null) }
  catch { screen.innerHTML = '<p class="muted">Couldn\'t open the sample just now.</p>' }
}

// ── The finished reading ─────────────────────────────────────────────────────
function report(md, id) {
  page.classList.add('wide')
  const wide = matchMedia('(min-width: 981px)').matches
  screen.innerHTML = `<div class="reader">
    <nav class="toc" aria-label="Contents"><details ${wide ? 'open' : ''}><summary class="label">Contents</summary><div id="tocl"></div></details>
      <div class="legend"><span><span class="mk trad">▲</span> traditionally read for career</span><span><span class="mk pers">●</span> stands out in this chart</span></div></nav>
    <article class="md">
      ${id ? '' : `<div class="banner"><span class="label">Sample reading</span><span>Jordan Park is fictional. The charts, the draw and the dates are calculated; the writing tests the format.</span><span><button class="linkbtn inline" type="button" id="mine">Make your own reading</button></span></div>`}
      <div class="tools"><button class="btn2" type="button" id="pdf">Download PDF</button>${id ? `<a class="btn2" href="/api/reading?op=report&id=${esc(id)}" download="career-reading.md">Download Markdown</a>` : ''}
        <span class="hint">For a PDF, choose "Save as PDF" in the print window.</span></div>
      ${id ? `<div class="noprint">${copyLinkHTML(id)}</div>` : ''}
      <div id="md">${window.marked.parse(md, { gfm: true, headerIds: false, mangle: false })}</div>
    </article></div>`
  wireCopy()
  $('#pdf').onclick = () => print()
  if (!id) $('#mine').onclick = () => nav('')
  const el = $('#md')
  el.querySelectorAll('table').forEach(t => { const w = document.createElement('div'); w.className = 'tablewrap'; t.parentNode.insertBefore(w, t); w.appendChild(t) })
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), hits = []
  while (walk.nextNode()) if (/[▲●]/.test(walk.currentNode.nodeValue)) hits.push(walk.currentNode)
  hits.forEach(n => { const span = document.createElement('span'); span.innerHTML = esc(n.nodeValue).replace(/▲/g, '<span class="mk trad" title="Traditionally read for career">▲</span>').replace(/●/g, '<span class="mk pers" title="Stands out in this chart">●</span>'); n.replaceWith(span) })
  const key = 'ticks:' + (id || 'sample'), ticks = store.get(key, localStorage) || {}
  el.querySelectorAll('li input[type="checkbox"]').forEach((cb, i) => {
    cb.disabled = false; cb.checked = !!ticks[i]; cb.closest('li').classList.add('task')
    cb.setAttribute('aria-label', 'Done: ' + cb.closest('li').textContent.trim().slice(0, 60))
    cb.onchange = () => { ticks[i] = cb.checked; store.set(key, ticks, localStorage) }
  })
  const hs = [...el.querySelectorAll('h2')]
  hs.forEach((h, i) => { h.id = 's' + i })
  const toc = $('#tocl')
  toc.innerHTML = hs.map((h, i) => `<a href="#s${i}" data-i="${i}">${esc(h.textContent)}</a>`).join('')
  toc.querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById('s' + a.dataset.i).scrollIntoView({ behavior: 'smooth' }) })
  const links = [...toc.querySelectorAll('a')]
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle('cur', l.dataset.i === en.target.id.slice(1))) }), { rootMargin: '0px 0px -75% 0px' })
  hs.forEach(h => io.observe(h))
}

route()
