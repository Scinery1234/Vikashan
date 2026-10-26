import {
  buildQuestions, score, offersIntroCall, QUADRANTS, TIMEFRAMES, BLOCKERS, COACH, FEEL_STRUGGLING
} from './quiz-logic.js'

// Switch programOpen on (and set checkoutUrl) once New Page checkout is live.
// Until then the New Page card collects "tell me when it opens" sign-ups.
const CONFIG = {
  programOpen: false,
  checkoutUrl: null,
  introCallUrl: '/#book-call',
  price: '$500'
}

const STORE_KEY = 'np_quiz_v1'
const app = document.getElementById('app')
const countEl = document.getElementById('count')
const progressEl = document.getElementById('progress')
const barEl = document.getElementById('progress-bar')

const params = new URLSearchParams(location.search)
const source = {
  utm_source: params.get('utm_source'),
  utm_medium: params.get('utm_medium'),
  utm_campaign: params.get('utm_campaign'),
  ref: params.get('ref') || (document.referrer ? new URL(document.referrer).hostname : null)
}

function sessionId() {
  try {
    let id = sessionStorage.getItem('np_sid')
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('np_sid', id) }
    return id
  } catch { return 'nostore-' + Math.random().toString(36).slice(2) }
}
const SID = sessionId()

function track(event, extra = {}) {
  const body = JSON.stringify({ sessionId: SID, event, ...extra, source })
  try {
    if (navigator.sendBeacon && navigator.sendBeacon('/api/newpage/event', new Blob([body], { type: 'application/json' }))) return
  } catch {}
  fetch('/api/newpage/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
}

const fresh = () => ({
  step: 'start', idx: 0, answers: {}, personal: { time: null, block: null, coach: null },
  name: '', email: '', optIn: true, intent: 'plan', sending: false, error: '',
  leadId: null, wantsProgram: false, safetyFrom: 'quiz',
  schol: { name: '', email: '', about: '', situation: '' }, reopens: ''
})
let S = fresh()

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ answers: S.answers, personal: S.personal, at: Date.now() })) } catch {}
}

// ── Tiny DOM helper ────────────────────────────────────────────
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  return el
}

function go(step, patch = {}) {
  Object.assign(S, patch, { step, error: '' })
  render()
  window.scrollTo({ top: 0 })
  const heading = app.querySelector('h1, h2')
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }) }
}

const post = (path, body) => fetch(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})

// ── Screens ────────────────────────────────────────────────────
function startScreen() {
  return h('section', { class: 'screen' },
    h('span', { class: 'note' }, 'takes 3 minutes'),
    h('h1', {}, 'What’s your next ', h('span', { class: 'hl' }, 'career move?')),
    h('p', { class: 'lead' }, h('b', {}, 'Where are you at? '), '10 quick questions. At the end you’ll see where you are right now and get a 4-week plan for your next move. No account needed.'),
    h('p', { class: 'muted' }, 'There are no right answers. Go with your first instinct.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { track('start'); go('q', { idx: 0 }) } }, 'Let’s start'),
    h('p', { class: 'small muted' }, 'For people 18 and over. This is coaching, not therapy. If you’re going through a hard time, ',
      h('button', { class: 'inline-link', type: 'button', onclick: () => go('safety', { safetyFrom: 'start' }) }, 'support is available any time'), '.')
  )
}

function questionScreen() {
  const list = buildQuestions(S.answers)
  const idx = Math.min(S.idx, list.length - 1)
  const q = list[idx]
  const last = idx === list.length - 1
  const pick = v => {
    S.answers[q.key] = v
    save()
    track('answer', { question: q.key, index: idx + 1 })
    render()
    setTimeout(() => {
      const next = buildQuestions(S.answers)
      if (idx >= next.length - 1) {
        if (S.answers.feel === FEEL_STRUGGLING) { track('safety_shown'); go('safety', { safetyFrom: 'quiz' }) }
        else showResult()
      } else go('q', { idx: idx + 1 })
    }, 220)
  }
  return h('section', { class: 'screen' },
    h('span', { class: 'label' }, q.section),
    q.prompt && h('p', { class: 'muted' }, q.prompt),
    h('h2', {}, q.text),
    h('div', { class: 'answers', role: 'group', 'aria-label': q.text },
      q.opts.map(o => h('button', { class: 'answer', type: 'button', 'aria-pressed': String(S.answers[q.key] === o.v), onclick: () => pick(o.v) }, o.l))),
    last && h('span', { class: 'note', style: { 'font-size': '23px' } }, 'tap an answer to see your result'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => idx > 0 ? go('q', { idx: idx - 1 }) : go('start') }, 'Back')
  )
}

function safetyScreen() {
  const fromQuiz = S.safetyFrom === 'quiz'
  const services = [
    ['Lifeline', '24/7 crisis support', '13 11 14', '131114'],
    ['Beyond Blue', 'Mental health support', '1300 22 4636', '1300224636'],
    ['13YARN', 'Aboriginal and Torres Strait Islander crisis support', '13 92 76', '139276'],
    ['Emergency', 'If you’re in immediate danger', '000', '000']
  ]
  return h('section', { class: 'screen' },
    h('h2', {}, fromQuiz ? 'Thanks for being honest' : 'Support, any time'),
    h('p', { class: 'lead' }, fromQuiz
      ? 'It sounds like things are really hard right now. Your career can wait. Talking to someone today matters more.'
      : 'If you’re going through a hard time, these services are free and confidential.'),
    h('div', { class: 'services' }, services.map(([name, desc, num, tel]) =>
      h('div', { class: 'service' }, h('div', {}, h('b', {}, name), h('span', {}, desc)), h('a', { href: 'tel:' + tel }, num)))),
    fromQuiz
      ? [h('button', { class: 'btn btn-secondary', type: 'button', onclick: showResult }, 'See my result'),
         h('button', { class: 'link-btn', type: 'button', onclick: () => go('start', fresh()) }, 'I’ll come back later')]
      : h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go('start') }, 'Back')
  )
}

function showResult() {
  track('result', { quadrant: score(S.answers).quadrant })
  go('result')
}

const clamp = n => Math.max(7, Math.min(93, n))

function resultScreen() {
  const r = score(S.answers)
  const Q = QUADRANTS[r.quadrant]
  const cell = (k, bottom) => h('div', { class: 'cell' + (bottom ? ' bottom' : ''), style: { background: k === r.quadrant ? QUADRANTS[k].color : QUADRANTS[k].tint } }, QUADRANTS[k].name)
  return h('section', { class: 'screen', style: { '--hlc': Q.color, '--btn-shadow': Q.color } },
    h('div', {},
      h('span', { class: 'note' }, 'you’re in'),
      h('h1', { style: { 'font-size': 'clamp(46px, 12vw, 60px)', 'margin-top': '6px' } }, h('span', { class: 'hl' }, Q.name)),
      h('p', { style: { 'font-weight': '600', 'margin-top': '8px' } }, Q.tag)),
    h('div', { class: 'grid-wrap' },
      h('span', { class: 'axis' }, 'More clarity'),
      h('div', { class: 'grid', role: 'img', 'aria-label': `Your result: ${Q.name}. Clarity ${r.clarity} out of 16, capacity ${r.capacity} out of 16.` },
        cell('unstick'), cell('launch'), cell('recharge', true), cell('explore', true),
        h('div', { class: 'dot', 'aria-hidden': 'true', style: { left: clamp(r.x) + '%', bottom: clamp(r.y) + '%' } })),
      h('span', { class: 'axis right' }, 'More capacity')),
    h('p', {}, Q.meaning),
    h('div', { class: 'card' },
      h('span', { class: 'label' }, 'Your first week'),
      h('p', {}, Q.week1),
      r.burnout && h('p', { class: 'small muted' }, 'You mentioned feeling burnt out, so your full plan includes a session with the Recovery Coach.')),
    r.lowMood && h('p', {}, 'You mentioned you’ve been feeling low. Go easy on yourself with this plan, and if things get heavier, Lifeline is there on 13 11 14, any time.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { track('personalise_open'); go('email', { intent: 'plan' }) } }, 'Get my full 4-week plan'),
    !r.struggling && newPageCard('result'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => go('start', fresh()) }, 'Retake the quiz')
  )
}

// What New Page is, before anyone is asked to join it.
function newPageCard(where) {
  const action = CONFIG.programOpen && CONFIG.checkoutUrl
    ? h('a', { class: 'btn btn-secondary', href: CONFIG.checkoutUrl, onclick: () => track('buy_click', { where }) }, `Start New Page: ${CONFIG.price}`)
    : S.wantsProgram
      ? h('p', { class: 'soft' }, 'Thanks. You’ll be among the first to hear when New Page opens.')
      : h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => tellMeWhenOpen(where) }, 'Tell me when it opens')
  return h('div', { class: 'np-card' },
    h('span', { class: 'label' }, where === 'done' ? 'About New Page' : 'Want some support with this?'),
    h('span', { class: 'offer-title' }, 'New Page: 4 weeks with a coach in your corner'),
    h('ul', {},
      h('li', {}, 'Your plan, loaded into a planner with reminders'),
      h('li', {}, 'AI coaches for when you’re stuck, low on energy, or deciding'),
      h('li', {}, 'A 60-minute 1:1 session with Vik')),
    h('p', { class: 'small muted' }, `${CONFIG.price} for 4 weeks${CONFIG.programOpen ? '' : ' · opening soon'}`),
    h('p', { class: 'small' }, h('b', {}, 'Change your mind within 7 days? '), 'Full refund. ',
      h('b', {}, 'Do the four weeks and don’t move forward? '), 'Your next month is on us.'),
    action,
    h('button', { class: 'link-btn blue', type: 'button', onclick: () => { track('scholarship_open', { where }); go('scholarship') } }, 'Can’t afford it right now? Apply for a scholarship')
  )
}

async function tellMeWhenOpen(where) {
  track('waitlist_click', { where })
  if (!S.leadId) return go('email', { intent: 'waitlist' })
  S.wantsProgram = true
  render()
  post('/api/newpage/lead', { update: 'waitlist', leadId: S.leadId, email: S.email.trim() }).catch(() => {})
}

function emailScreen() {
  const waitlist = S.intent === 'waitlist'
  return h('form', { class: 'screen', novalidate: true, onsubmit: submitLead },
    waitlist
      ? [h('h2', {}, 'We’ll tell you when New Page opens'),
         h('p', { class: 'muted' }, 'We’ll send your full 4-week plan now, too.')]
      : [h('h2', {}, 'Where should we send your plan?'),
         h('p', { class: 'muted' }, 'Your full 4-week plan, plus a calendar invite for your first step.')],
    h('div', { class: 'card' },
      h('div', { class: 'field' },
        h('label', { for: 'np-name' }, 'First name'),
        h('input', { id: 'np-name', type: 'text', autocomplete: 'given-name', maxlength: '80', value: S.name, oninput: e => { S.name = e.target.value } })),
      h('div', { class: 'field' },
        h('label', { for: 'np-email' }, 'Email'),
        h('input', { id: 'np-email', type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: '200', required: true, value: S.email, oninput: e => { S.email = e.target.value } })),
      h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', { for: 'np-website' }, 'Leave this empty'), h('input', { id: 'np-website', type: 'text', tabindex: '-1', autocomplete: 'off' })),
      h('label', { class: 'check', for: 'np-optin' },
        h('input', { id: 'np-optin', type: 'checkbox', checked: S.optIn, onchange: e => { S.optIn = e.target.checked } }),
        h('span', {}, 'Send me a few short emails to help me stick with my plan. Unsubscribe any time.')),
      S.error && h('p', { class: 'error', role: 'alert' }, S.error)),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: S.sending }, S.sending ? 'Sending…' : 'Send my plan'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => go('result') }, 'Back to my result')
  )
}

async function submitLead(e) {
  e.preventDefault()
  if (S.sending) return
  const email = S.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    S.error = 'Add your email so we can send your plan.'
    render(); document.getElementById('np-email')?.focus(); return
  }
  S.sending = true; render()
  try {
    const res = await post('/api/newpage/lead', {
      answers: S.answers, name: S.name.trim(), email, optIn: S.optIn,
      intent: S.intent, sessionId: SID, source, website: document.getElementById('np-website')?.value || ''
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
    S.sending = false
    go('done', { leadId: data.leadId || null, wantsProgram: S.intent === 'waitlist' })
  } catch (err) {
    S.sending = false
    S.error = err.message || 'Something went wrong. Please try again.'
    render()
  }
}

// Optional taps after the plan is sent. Each tap is saved straight away.
function chipGroup(label, options, field) {
  return h('div', { class: 'field' },
    h('span', { style: { 'font-weight': '700' } }, label),
    h('div', { class: 'chips', role: 'group', 'aria-label': label }, options.map(o =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.personal[field] === o.v), onclick: () => {
        S.personal[field] = S.personal[field] === o.v ? null : o.v
        save(); render()
        track('personal_saved', { where: field })
        if (S.leadId) post('/api/newpage/lead', { update: 'personal', leadId: S.leadId, email: S.email.trim(), personal: S.personal }).catch(() => {})
      } }, o.l))))
}

function doneScreen() {
  const r = score(S.answers)
  const Q = QUADRANTS[r.quadrant]
  const call = offersIntroCall(S.personal, r)
  return h('section', { class: 'screen', style: { '--hlc': Q.color } },
    h('span', { class: 'note' }, 'sent!'),
    h('h2', {}, 'Your plan is on its way to ', h('span', { class: 'hl' }, S.email || 'your inbox')),
    h('p', {}, `It’s your full 4-week ${Q.name} plan, with a calendar invite for your first step. Check your junk folder if it hasn’t arrived in a few minutes.`),
    !r.struggling && [
      h('div', { class: 'card' },
        h('span', { class: 'offer-title' }, 'Want to make it even more yours?'),
        h('p', { class: 'small muted' }, 'Optional. Three quick taps help us tailor what comes next.'),
        chipGroup('When would you like things to be different?', TIMEFRAMES, 'time'),
        chipGroup('What’s most in the way?', BLOCKERS, 'block'),
        chipGroup('Would you like support from a coach?', COACH, 'coach')),
      call && h('div', { class: 'call-card', style: { background: Q.tint } },
        h('span', { class: 'offer-title' }, 'Since you’d like some support'),
        h('p', {}, 'Book a free 15-minute call with Vik. You’ll talk about where you’re at and whether New Page is the right fit. No pressure either way.'),
        h('a', { class: 'btn btn-primary', href: CONFIG.introCallUrl, onclick: () => track('call_click') }, 'Book a free call')),
      newPageCard('done')
    ],
    h('button', { class: 'link-btn', type: 'button', onclick: () => go('start', fresh()) }, 'Retake the quiz')
  )
}

function scholarshipScreen() {
  const s = S.schol
  const field = (id, label, key, type = 'text', extra = {}) => h('div', { class: 'field' },
    h('label', { for: id }, label),
    type === 'textarea'
      ? h('textarea', { id, maxlength: '1500', ...extra, oninput: e => { s[key] = e.target.value } }, s[key])
      : h('input', { id, type, maxlength: '200', value: s[key], ...extra, oninput: e => { s[key] = e.target.value } }))
  return h('form', { class: 'screen', novalidate: true, onsubmit: submitScholarship },
    h('h2', {}, 'New Page scholarships'),
    h('p', {}, 'Supported by Purposefields. Each month there are five free places in New Page for people who couldn’t otherwise afford it. A scholarship covers the full program, including your 1:1 session with Vik.'),
    h('div', { class: 'card' },
      field('sc-name', 'Your name', 'name', 'text', { autocomplete: 'name' }),
      field('sc-email', 'Email', 'email', 'email', { autocomplete: 'email', inputmode: 'email' }),
      field('sc-about', 'Tell us a little about yourself (a few sentences)', 'about', 'textarea'),
      field('sc-situation', 'What’s your current situation, and why would New Page help right now?', 'situation', 'textarea'),
      h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', { for: 'sc-website' }, 'Leave this empty'), h('input', { id: 'sc-website', type: 'text', tabindex: '-1', autocomplete: 'off' })),
      S.error && h('p', { class: 'error', role: 'alert' }, S.error)),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: S.sending }, S.sending ? 'Sending…' : 'Apply'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => go(S.leadId ? 'done' : S.answers.feel ? 'result' : 'start') }, 'Back')
  )
}

async function submitScholarship(e) {
  e.preventDefault()
  if (S.sending) return
  const s = S.schol
  if (!s.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()) || !s.about.trim() || !s.situation.trim()) {
    S.error = 'Please fill in all four fields.'; render(); return
  }
  S.sending = true; render()
  const r = S.answers.feel ? score(S.answers) : null
  try {
    const res = await post('/api/newpage/scholarship', {
      name: s.name.trim(), email: s.email.trim(), about: s.about.trim(), situation: s.situation.trim(),
      quadrant: r?.quadrant || null, sessionId: SID, website: document.getElementById('sc-website')?.value || ''
    })
    const data = await res.json().catch(() => ({}))
    S.sending = false
    if (data.full) return go('scholarship-full', { reopens: data.reopens || '' })
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
    go('scholarship-done')
  } catch (err) {
    S.sending = false; S.error = err.message; render()
  }
}

function scholarshipDone() {
  return h('section', { class: 'screen' },
    h('span', { class: 'note' }, 'received'),
    h('h2', {}, `Thanks, ${S.schol.name.split(' ')[0]}.`),
    h('p', {}, 'Vik reads every application personally and will reply by email.'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => go('start', fresh()) }, 'Back to the start'))
}

function scholarshipFull() {
  return h('section', { class: 'screen' },
    h('h2', {}, 'This month’s scholarships have all been given'),
    h('p', {}, S.reopens ? `Applications reopen on ${S.reopens}.` : 'Applications reopen at the start of next month.'),
    h('p', { class: 'muted' }, 'In the meantime, the quiz and your 4-week plan are free.'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => go('start') }, 'Back to the start'))
}

// ── Render ─────────────────────────────────────────────────────
let lastScreen = null
function render() {
  const inQuiz = S.step === 'q'
  countEl.hidden = progressEl.hidden = !inQuiz
  if (inQuiz) {
    const total = buildQuestions(S.answers).length
    const n = Math.min(S.idx, total - 1) + 1
    countEl.textContent = `${n} of ${total}`
    barEl.style.width = `${Math.round((n / total) * 100)}%`
  }
  const screens = {
    start: startScreen, q: questionScreen, safety: safetyScreen, result: resultScreen,
    email: emailScreen, done: doneScreen, scholarship: scholarshipScreen,
    'scholarship-done': scholarshipDone, 'scholarship-full': scholarshipFull
  }
  const active = document.activeElement?.id
  const screen = (screens[S.step] || startScreen)()
  const key = S.step === 'q' ? `q${S.idx}` : S.step
  if (key !== lastScreen) screen.classList.add('enter')
  lastScreen = key
  app.replaceChildren(screen)
  if (active && document.getElementById(active)) document.getElementById(active).focus()
}

if (location.hash === '#scholarship') S.step = 'scholarship'
render()
track('view')
