import { STATEMENTS, SCALE, FEELINGS, QUADRANTS } from '/newpage/quiz-logic.js'
import { h, todayStr } from './ui.js'
import { plannerScreen } from './planner.js'
import { compassScreen, compassStatus, COMPASS_STEPS } from './compass.js'
import { docsScreen } from './docs.js'
import { sessionScreen } from './session.js'
import { sectionsScreen, sectionKinds } from './sections.js'
import { openSky, skySeen } from './sky.js'
import { notesScreen, noteFrom, flushNotes } from './notes.js'
import { copyText } from './ui.js'

const KEY = 'np_app_session'
const app = document.getElementById('app')
const tabbar = document.getElementById('tabbar')
const signoutBtn = document.getElementById('signout')

let session = null
try { session = localStorage.getItem(KEY) } catch {}

const S = {
  screen: 'loading', tab: 'today', tool: null, coach: 'career', me: null, error: '', info: '',
  email: '', sending: false, busy: false,
  coachDraft: '', coachSending: false, crisis: false, coachError: '',
  checkin: {}, checkinResult: null, newTask: ''
}

async function call(url, body, token = session) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const slow = res.status === 504 || res.status === 408
    const e = new Error(data.error || (slow ? 'That took too long to write. Please try again, with a shorter work history if you pasted a long one.' : 'Something went wrong. Please try again.'))
    e.code = data.code; e.status = res.status; throw e
  }
  return data
}

async function act(action, body = {}, raw = false) {
  try {
    const data = await call('/api/newpage/app', { action, coach: S.coach, ...body })
    if (raw) return data
    S.me = data
    S.error = ''
    return data
  } catch (e) {
    if (e.code === 'signed_out') return signOut()
    if (e.code === 'paused' || e.code === 'ended' || e.code === 'expired') { S.screen = 'noaccess'; S.error = e.message; render(); return null }
    throw e
  }
}

function signOut() {
  session = null
  try { localStorage.removeItem(KEY) } catch {}
  Object.assign(S, { me: null, screen: 'login', tab: 'today', tool: null, coach: 'career', error: '', info: '', checkinResult: null })
  render()
  return null
}
signoutBtn.addEventListener('click', signOut)

// ── Sign in ──────────────────────────────────────────────────────
function loginScreen() {
  return h('form', { class: 'screen', novalidate: true, onsubmit: async e => {
    e.preventDefault()
    const email = S.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { S.error = 'Enter the email you used for New Page.'; render(); return }
    S.sending = true; S.error = ''; render()
    try {
      await call('/api/newpage/auth', { action: 'request', email }, null)
      S.sending = false; S.screen = 'sent'; render()
    } catch (err) { S.sending = false; S.error = err.message; render() }
  } },
    h('span', { class: 'note' }, 'welcome back'),
    h('h1', {}, 'Sign in to ', h('span', { class: 'hl' }, 'New Page')),
    h('p', { class: 'lead' }, 'Enter the email you joined with and we’ll send you a link. There’s no password to remember.'),
    S.info && h('p', { class: 'soft' }, S.info),
    h('div', { class: 'card' },
      h('div', { class: 'field' },
        h('label', { for: 'li-email' }, 'Email'),
        h('input', { id: 'li-email', type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: '200', value: S.email, oninput: e => { S.email = e.target.value } })),
      S.error && h('p', { class: 'error', role: 'alert' }, S.error)),
    h('button', { class: 'btn btn-primary', type: 'submit', disabled: S.sending }, S.sending ? 'Sending…' : 'Email me a link'),
    h('p', { class: 'small muted' }, 'Not a member yet? ', h('a', { href: '/newpage/program' }, 'See what New Page is'), ' or ', h('a', { href: '/newpage' }, 'take the free quiz'), '.'))
}

function sentScreen() {
  return h('section', { class: 'screen' },
    h('span', { class: 'note' }, 'check your email'),
    h('h2', {}, 'We’ve sent a link to ', h('span', { class: 'hl' }, S.email)),
    h('p', {}, 'Open it on this device to sign in. It works for 15 minutes. If you don’t see it, check your junk folder.'),
    h('p', { class: 'small muted' }, 'If that email isn’t a New Page member, no email is sent, and nothing in this screen will tell you either way.'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => { S.screen = 'login'; render() } }, 'Use a different email'))
}

function noAccessScreen() {
  return h('section', { class: 'screen' },
    h('h2', {}, 'No access right now'),
    h('p', {}, S.error || 'This email doesn’t have access to New Page.'),
    h('p', { class: 'muted' }, 'If you think that’s a mistake, reply to any email from Vik and it will be sorted out.'),
    h('button', { class: 'link-btn', type: 'button', onclick: signOut }, 'Sign out'))
}

// ── Pieces ───────────────────────────────────────────────────────
const fmtDate = d => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
const stepDone = (week, i) => S.me.progress.includes(`${week}-${i}`)

// This week's tool, when the plan features one.
function toolCallout(w) {
  if (w.tool !== 'compass') return null
  return h('div', { class: 'tool-callout' },
    h('div', {}, h('b', {}, 'This week’s tool: the Compass'), h('p', { class: 'small' }, 'Ten short steps from what matters to you to three first steps. It saves as you go, and Sky will know what you find.')),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go('tools', 'compass') }, 'Open the Compass'))
}

const TOOL_LABELS = { compass: 'Open the Compass', planner: 'Open the planner', resume: 'Open the resume writer', cover: 'Open the cover letter writer', linkedin: 'Open the LinkedIn writer', outreach: 'Open the message writer', report: 'Create my report', brief: 'Fill in my brief', progress: 'Create my report', session: 'Book or see my session' }
const COACH_NAMES = c => { const n = (S.me.coaches.find(x => x.id === c) || {}).name; return n ? `Sky (${n})` : 'Sky' }

// One task in the program: a tick-box, how long it takes, and a button that takes them to the right tool or coach.
function taskRow(week, i, task) {
  const action = task.tool
    ? h('button', { class: 'link-btn blue', type: 'button', onclick: () => go('tools', task.tool) }, TOOL_LABELS[task.tool] || 'Open')
    : task.coach
      ? h('button', { class: 'link-btn blue', type: 'button', onclick: () => askCoach(task.prompt || '', task.coach) }, `Talk to ${COACH_NAMES(task.coach)}`)
      : null
  return h('li', {}, h('label', { class: 'step' },
    h('input', { type: 'checkbox', checked: stepDone(week, i), onchange: async e => {
      const done = e.target.checked
      try { await act('progress', { week, step: i, done }) } catch (err) { S.error = err.message }
      render()
    } }),
    h('span', {}, task.text, task.minutes && h('small', { class: 'mins' }, ` · about ${task.minutes < 60 ? task.minutes + ' min' : (task.minutes / 60).toFixed(task.minutes % 60 ? 1 : 0).replace('.0', '') + ' h'}`))),
    action && h('div', { class: 'task-action' }, action))
}

// Text with **bold** as real bold, never as HTML.
const inline = t => String(t).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map(p => (p.startsWith('**') && p.endsWith('**') ? h('b', {}, p.slice(2, -2)) : p.startsWith('*') && p.endsWith('*') && p.length > 2 ? h('i', {}, p.slice(1, -1)) : p))
function body(lines) {
  const out = []; let list = null
  for (const line of lines) {
    if (line.startsWith('- ')) { if (!list) { list = h('ul', {}); out.push(list) } list.append(h('li', {}, inline(line.slice(2)))); continue }
    list = null
    out.push(line.startsWith('## ') ? h('h4', {}, line.slice(3)) : h('p', {}, inline(line)))
  }
  return out
}

function lessonList(week) {
  return h('ul', { class: 'lessons' }, week.lessons.map(l => h('li', {}, h('button', { class: 'lesson-btn', type: 'button', onclick: () => openLesson(l.id) },
    h('b', {}, l.title), h('small', {}, `${l.minutes} min read`)))))
}

function templateList(week) {
  return week.templates.map(t => h('details', { class: 'tmpl' }, h('summary', {}, t.title),
    h('pre', {}, t.text), h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => noteFrom(ctx, t.title, t.text) }, 'Work on this in Notes'), h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(t.text, e.currentTarget) }, 'Copy'))))
}

function lessonScreen() {
  const plan = S.me.plan
  let found = null, wk = 0
  plan?.weeks.forEach((w, i) => w.lessons.forEach(l => { if (l.id === S.lessonId) { found = l; wk = i + 1 } }))
  if (!found) plan?.library.forEach(l => { if (l.id === S.lessonId) { found = l; wk = 0 } })
  if (!found) return h('section', { class: 'screen' }, h('button', { class: 'link-btn back', type: 'button', onclick: () => go('plan') }, '← Program'), h('p', {}, 'That reading isn’t part of your program.'))
  return h('section', { class: 'screen lesson' },
    h('button', { class: 'link-btn back', type: 'button', onclick: () => go('plan') }, '← Program'),
    h('span', { class: 'note' }, wk ? `week ${wk} · ${found.minutes} min` : `library · ${found.minutes} min`), h('h2', {}, found.title),
    h('div', { class: 'prose' }, body(found.body)),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => askCoach(`I just read “${found.title}”. `) }, 'Talk it through with Sky'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => go('today') }, 'Back to today'))
}

function gridCard(me) {
  const q = me.plan
  const clamp = n => Math.max(7, Math.min(93, n))
  const cell = k => h('div', { class: 'cell', style: { background: k === q.quadrant ? QUADRANTS[k].color : QUADRANTS[k].tint } }, QUADRANTS[k].name)
  return h('div', { class: 'card' },
    h('span', { class: 'label' }, 'Where you’re at'),
    h('div', { class: 'mini-grid-wrap' },
      h('div', { class: 'grid', role: 'img', 'aria-label': `You’re in ${q.name}.` },
        cell('unstick'), cell('launch'), cell('recharge'), cell('explore'),
        me.position && h('div', { class: 'dot', 'aria-hidden': 'true', style: { left: clamp(me.position.x) + '%', bottom: clamp(me.position.y) + '%' } })),
      h('div', {},
        h('p', { style: { 'font-family': 'var(--display)', 'font-weight': '700', 'font-size': '22px' } }, h('span', { class: 'hl', style: { '--hlc': q.color } }, q.name)),
        h('p', { class: 'small muted' }, q.tag),
        h('button', { class: 'link-btn blue', type: 'button', onclick: () => go('me') }, 'Retake the check-in'))))
}

function taskList(tasks, limit) {
  const open = tasks.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
  const shown = limit ? open.slice(0, limit) : tasks
  return h('div', { class: 'tasks' },
    shown.length ? shown.map(t => h('div', { class: 'task' },
      h('label', {},
        h('input', { type: 'checkbox', checked: t.done, onchange: async e => { try { await act('task_toggle', { id: t.id, done: e.target.checked }) } catch (err) { S.error = err.message } render() } }),
        h('span', { class: 't' }, t.title)),
      (t.source === 'coach' || t.source === 'vik') && h('span', { class: 'src' + (t.source === 'vik' ? ' vik' : '') }, t.source === 'vik' ? 'From Vik' : 'From Sky'),
      t.due && h('span', { class: 'due' }, fmtDate(t.due)),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${t.title}`, onclick: async () => { try { await act('task_delete', { id: t.id }) } catch (err) { S.error = err.message } render() } }, '×')))
      : h('p', { class: 'muted small' }, 'No tasks yet. Add the next small thing you’ll do.'),
    h('form', { class: 'add-row', onsubmit: async e => {
      e.preventDefault()
      const title = S.newTask.trim()
      if (!title) return
      S.newTask = ''
      try { await act('task_add', { title }) } catch (err) { S.error = err.message }
      render()
      document.getElementById('new-task')?.focus()
    } },
      h('label', { class: 'hp', for: 'new-task-l' }, 'New task'),
      h('input', { id: 'new-task', type: 'text', maxlength: '200', placeholder: 'Add a task…', 'aria-label': 'New task', value: S.newTask, oninput: e => { S.newTask = e.target.value } }),
      h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Add')))
}

function askCoach(text, coach = 'career') {
  S.coachDraft = text
  openCoach(coach)
}

function openLesson(id) {
  S.lessonId = id; S.error = ''
  try { history.replaceState(null, '', `#lesson/${id}`) } catch {}
  render(); window.scrollTo({ top: 0 })
}

async function openCoach(id) {
  S.coach = id; S.coachError = ''; S.crisis = false
  if (S.me) S.me.messages = []
  go('coach')
  try { await act('me') } catch (e) { S.error = e.message }
  render(); scrollChat()
}

const ctx = {
  get S() { return S },
  call: (url, body) => call(url, body),
  token: () => session,
  beacon: (url, body) => { try { fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }, body: JSON.stringify(body) }) } catch {} },
  act, buy: (action, body) => buy(action, body), render: () => render(), go: (tab, sub) => go(tab, sub),
  askCoach: (coach, text) => askCoach(text, coach),
  setFocus: id => { if (id !== S.coach) openCoach(id); else go('coach') }
}

window.__npCtx = ctx

// ── Today ────────────────────────────────────────────────────────
function todayScreen() {
  const me = S.me, p = me.program, plan = me.plan
  const first = (me.member.name || '').split(' ')[0]
  if (!plan) {
    return h('section', { class: 'screen' },
      h('span', { class: 'note' }, 'welcome'),
      h('h1', {}, first ? `Hi ${first}.` : 'Welcome.'),
      h('p', { class: 'lead' }, 'Let’s find your starting point. The check-in takes about two minutes, and gives you your plan for the four weeks.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('me') }, 'Start the check-in'),
      gettingStarted(me))
  }
  const week = plan.weeks[p.week - 1]
  const pct = p.totalThisWeek ? Math.round((p.doneThisWeek / p.totalThisWeek) * 100) : 0
  return h('section', { class: 'screen', style: { '--q': plan.color, '--hlc': plan.color, '--btn-shadow': plan.color } },
    h('div', { class: 'hello' },
      h('span', { class: 'note' }, p.complete ? 'four weeks done' : `day ${p.day} of 28`),
      h('h1', {}, first ? `Hi ${first}.` : 'Welcome back.')),
    S.info && h('div', { class: 'soft', role: 'status' }, S.info),
    p.complete && h('div', { class: 'soft' }, h('b', {}, 'You’ve done your four weeks. '), 'Retake the check-in to see how far you’ve moved, and talk to Sky about what’s next.'),
    h('div', { class: 'today-grid' },
    gettingStarted(me),
    h('div', { class: 'week-card' },
      h('div', { class: 'week-head' }, h('h2', {}, `Week ${p.week}: ${week.title}`), h('span', { class: 'pill' }, `${p.doneThisWeek} of ${p.totalThisWeek} done`)),
      h('p', { class: 'muted' }, week.goal),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'This week’s progress' }, h('i', { style: { width: pct + '%' } })),
      h('ul', { class: 'steps-list' }, week.tasks.map((t, i) => taskRow(p.week, i, t))),
      toolCallout(week),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => askCoach(`I’m on week ${p.week}, “${week.title}”. `) }, 'Stuck? Ask Sky about this week')),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'By the end of this week you’ll have'),
      h('ul', { class: 'deliverables' }, week.deliverables.map(d => h('li', {}, d)))),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'Read this week'), lessonList(week)),
    h('div', { class: 'two' },
      gridCard(me),
      sessionCard(me)),
    renewCard(me),
    h('div', { class: 'card' },
      h('span', { class: 'label' }, 'Your next steps'),
      taskList(me.tasks, 5),
      h('button', { class: 'link-btn blue', type: 'button', onclick: () => go('tools', 'planner') }, 'Open your planner'))))
}

async function buy(action, body = {}) {
  S.busy = true; S.error = ''; render()
  try { const d = await act(action, body, true); if (d?.url) { location.href = d.url; return } } catch (e) { S.error = e.message }
  S.busy = false; render()
}

const GS_KEY = 'np_gs_hidden'
function gettingStarted(me) {
  let hidden = false
  try { hidden = !!localStorage.getItem(GS_KEY) } catch {}
  if (hidden || me.program.day > 7) return null
  const done = me.progress.length > 0
  const row = (ok, text, label, onclick) => h('li', { class: ok ? 'gs-done' : '' }, h('span', { 'aria-hidden': 'true' }, ok ? '✓' : '○'), h('span', {}, text), !ok && h('button', { class: 'link-btn blue', type: 'button', onclick }, label))
  return h('div', { class: 'card gs' },
    h('div', { class: 'week-head' }, h('span', { class: 'label' }, 'Getting started'), h('button', { class: 'link-btn', type: 'button', onclick: () => { try { localStorage.setItem(GS_KEY, '1') } catch {} render() } }, 'Hide')),
    h('ul', { class: 'gs-list' },
      row(!!me.plan, 'Do your 2-minute check-in', 'Start', () => go('me')),
      row(done, 'Tick off your first step below', 'See it', () => window.scrollTo({ top: 0, behavior: 'smooth' })),
      row(me.messages.length > 0 || !!S.coachUsed, 'Say hello to Sky, your AI Coach', 'Say hello', () => go('coach')),
      row(me.sessions.upcoming.length > 0, 'Book your 1:1 with Vik (best in week 2 or 3)', 'Book', () => go('tools', 'session'))))
}

function renewCard(me) {
  const p = me.program
  const endsSoon = me.member.accessUntil && new Date(me.member.accessUntil).getTime() - Date.now() < 7 * 864e5
  if (!me.member.canBuy || !(p.week >= 4 || p.complete || endsSoon)) return null
  const until = me.member.accessUntil ? new Date(me.member.accessUntil).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }) : null
  return h('div', { class: 'card' },
    h('span', { class: 'label' }, 'Keep going'),
    h('p', {}, 'Want another month? $500 gets you a month of New Page and one more 60-minute session with Vik.', until && ` Your access currently runs to ${until}.`),
    S.error && h('p', { class: 'error', role: 'alert' }, S.error),
    h('button', { class: 'btn btn-primary', type: 'button', disabled: S.busy, onclick: () => buy('renew_checkout') }, S.busy ? 'One moment…' : 'Renew for $500'),
    h('p', { class: 'small muted' }, 'You pay on a secure Stripe page. It’s one month at a time. Nothing renews by itself.'))
}

function sessionCard(me) {
  const p = me.program, ss = me.sessions
  return h('div', { class: 'card' },
    h('span', { class: 'label' }, 'Your 1:1 with Vik'),
    ss.upcoming.length
      ? [h('p', {}, h('b', {}, 'Session booked. '), `${new Date(ss.upcoming[0].date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} at ${ss.upcoming[0].time}, Sydney time. The link is in your email.`),
         h('button', { class: 'link-btn blue', type: 'button', onclick: () => go('tools', 'session') }, 'See details')]
      : ss.remaining > 0
        ? [h('p', {}, p.sessionWindow ? 'This is the best time to book your 60-minute session. Vik will have seen your plan and progress beforehand.' : 'Your 60-minute session is best booked for weeks 2 to 3, so there’s something to talk about. You can book it any time.'),
           h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('tools', 'session') }, 'Book your session')]
        : h('p', {}, 'You’ve used your included session. Reply to any email from Vik if you’d like more time.'))
}

// ── Plan ─────────────────────────────────────────────────────────
function planScreen() {
  const me = S.me, plan = me.plan
  if (!plan) return h('section', { class: 'screen' }, h('h2', {}, 'Your program'), h('p', {}, 'Your program appears once you’ve done the check-in.'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('me') }, 'Start the check-in'))
  return h('section', { class: 'screen', style: { '--hlc': plan.color } },
    h('h2', {}, 'Your program: ', h('span', { class: 'hl' }, plan.name)),
    h('p', { class: 'muted' }, plan.meaning),
    h('div', { class: 'weeks' }, plan.weeks.map((w, i) => {
      const n = i + 1, done = w.tasks.filter((_, j) => stepDone(n, j)).length
      return h('details', { open: n === me.program.week }, h('summary', {}, h('span', {}, `Week ${n}: ${w.title}`), h('small', {}, `${done}/${w.tasks.length}`)),
        h('div', {}, h('p', { class: 'muted small' }, w.goal),
          h('span', { class: 'label' }, 'You’ll have'), h('ul', { class: 'deliverables' }, w.deliverables.map(d => h('li', {}, d))),
          h('span', { class: 'label' }, 'Do'), h('ul', { class: 'steps-list' }, w.tasks.map((t, j) => taskRow(n, j, t))), toolCallout(w),
          h('span', { class: 'label' }, 'Read'), lessonList(w),
          h('span', { class: 'label' }, 'Use'), templateList(w),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => askCoach(`${w.reflect} `) }, 'Reflect with a coach')))
    })),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'Your library'),
      h('p', { class: 'small muted' }, 'Guides, scripts and question banks. They’re yours to keep going back to.'),
      h('ul', { class: 'lessons' }, plan.library.map(l => h('li', {}, h('button', { class: 'lesson-btn', type: 'button', onclick: () => openLesson(l.id) }, h('b', {}, l.title), h('small', {}, `${l.minutes} min read · ${l.summary}`)))))),
    plan.tweaks.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Just for you'), h('ul', { style: { margin: 0, 'padding-left': '20px' } }, plan.tweaks.map(t => h('li', {}, t)))),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'Your tasks'), taskList(me.tasks, 8), h('button', { class: 'link-btn blue', type: 'button', onclick: () => go('tools', 'planner') }, 'Open your planner')))
}

// ── Coach ────────────────────────────────────────────────────────
function coachScreen() {
  const me = S.me
  const info = me.coaches.find(c => c.id === S.coach) || me.coaches[0]
  const starters = info.starters
  const send = async text => {
    text = text.trim()
    if (!text || S.coachSending) return
    S.coachSending = true; S.coachError = ''; S.crisis = false; S.coachUsed = true
    me.messages = [...me.messages, { role: 'user', content: text }]
    S.coachDraft = ''
    render(); scrollChat()
    try {
      const data = await act('coach', { message: text, coach: S.coach })
      if (data?.crisis) S.crisis = true
    } catch (err) {
      me.messages = me.messages.slice(0, -1)
      S.coachDraft = text
      S.coachError = err.message
    }
    S.coachSending = false
    render(); scrollChat()
  }
  return h('section', { class: 'screen chat' },
    h('div', { class: 'sky-head' },
      h('div', {}, h('span', { class: 'note' }, 'your AI Coach'), h('h2', {}, 'Sky')),
      h('div', { class: 'sky-focus' },
        h('button', { class: 'chip focus-btn', type: 'button', 'aria-haspopup': 'dialog', onclick: () => openSky(ctx) }, h('span', { class: 'muted' }, 'Focus: '), h('b', {}, info.name), ' ▾'),
        h('button', { class: 'link-btn blue', type: 'button', onclick: () => openSky(ctx) }, 'What can Sky help with?'))),
    h('p', { class: 'small muted' }, `${info.blurb} Sky is an AI. It’s coaching, not therapy, and it can’t replace your session with Vik.`),
    !me.coachOn && h('p', { class: 'soft' }, 'The coach isn’t switched on yet. Everything else in New Page works.'),
    S.crisis && h('div', { class: 'crisis', role: 'alert' }, h('b', {}, 'Support is available right now'),
      h('p', {}, 'Lifeline 13 11 14 (24/7) · Beyond Blue 1300 22 4636 · Emergency 000')),
    h('div', { class: 'msgs', id: 'msgs' },
      me.messages.length ? me.messages.map(m => h('div', { class: `msg ${m.role}` }, m.content))
        : h('div', { class: 'msg assistant' }, `Hi${me.member.name ? ' ' + me.member.name.split(' ')[0] : ''}. ${info.open}`),
      S.coachSending && h('div', { class: 'msg assistant typing', 'aria-label': 'Sky is typing' }, '···')),
    !me.messages.length && h('div', { class: 'starters' }, starters.map(s => h('button', { class: 'chip', type: 'button', onclick: () => send(s) }, s))),
    S.coachError && h('p', { class: 'error', role: 'alert' }, S.coachError),
    h('form', { class: 'composer', onsubmit: e => { e.preventDefault(); send(S.coachDraft) } },
      h('textarea', { id: 'coach-box', rows: '1', maxlength: '2000', placeholder: 'Type a message…', 'aria-label': 'Message Sky', disabled: S.coachSending || !me.coachOn, oninput: e => { S.coachDraft = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; const sendBtn = document.getElementById('coach-send'); if (sendBtn) sendBtn.disabled = S.coachSending || !S.coachDraft.trim() },
        onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(S.coachDraft) } } }, S.coachDraft),
      h('button', { id: 'coach-send', class: 'btn btn-primary', type: 'submit', disabled: S.coachSending || !me.coachOn || !S.coachDraft.trim() }, 'Send')),
    me.messages.length > 0 && h('button', { class: 'link-btn', type: 'button', onclick: async () => { if (!S.confirmClear) { S.confirmClear = true; render(); return } S.confirmClear = false; try { await act('coach_clear', { coach: S.coach }) } catch (err) { S.error = err.message } render() } },
      S.confirmClear ? 'Tap again to clear this conversation' : 'Clear this conversation'))
}
function scrollChat() { const m = document.getElementById('msgs'); if (m) m.lastElementChild?.scrollIntoView({ block: 'end' }) }

// ── Tools ────────────────────────────────────────────────────────
const TOOL_GROUPS = [
  ['Your direction', [
    ['compass', 'The Compass', 'Ten short steps from what matters to you to three first steps.'],
    ['report', 'Career Direction Report', 'One personal document from your Compass, check-ins and notes.']]],
  ['Get hired', [
    ['resume', 'Resume writer', 'A tailored resume from your own work history and a job ad.'],
    ['cover', 'Cover letter writer', 'A short letter in your voice for one specific job.'],
    ['linkedin', 'LinkedIn profile writer', 'Headline, About, experience and skills, from your own history.'],
    ['outreach', 'Outreach messages', 'Ask for a conversation, follow up, and say thank you.']]],
  ['Your 1:1 with Vik', [
    ['session', 'Book your session', 'Book the 60-minute session that comes with New Page.'],
    ['brief', 'Session brief', 'Four questions so Vik can start on what matters.']]],
  ['Stay on track', [
    ['planner', 'Planner', 'Tasks, time blocks, goals and a morning reminder.'],
    ['notes', 'Notes', 'A private place to type and work things out. Program templates open here too.'],
    ['progress', 'Progress Report', 'What you did, what changed, and your next 30 days.']]]
]
const TOOLS = TOOL_GROUPS.flatMap(([, items]) => items)
let compassNote = ''
function toolsScreen() {
  if (S.tool === 'session') return sessionScreen(ctx)
  if (S.tool === 'planner') return plannerScreen(ctx)
  if (S.tool === 'notes') return notesScreen(ctx)
  if (S.tool === 'compass') return compassScreen(ctx)
  if (S.tool === 'resume' || S.tool === 'cover') return docsScreen(ctx, S.tool)
  if (sectionKinds.includes(S.tool)) return sectionsScreen(ctx, S.tool)
  const me = S.me
  const open = me.tasks.filter(t => !t.done).length
  const due = me.tasks.filter(t => !t.done && t.due && t.due <= todayStr()).length
  compassStatus(ctx).then(c => { const n = c ? (c.done ? 'Finished' : c.step > 0 || c.values.length ? `Step ${c.step + 1} of 10: ${COMPASS_STEPS[c.step]}` : '') : ''; if (n !== compassNote) { compassNote = n; if (S.tab === 'tools' && !S.tool) render() } })
  const status = { session: me.sessions.upcoming.length ? 'Booked' : me.sessions.remaining ? `${me.sessions.remaining} included` : '', planner: due ? `${due} due today` : open ? `${open} open` : '', compass: compassNote, resume: '', cover: '', report: '', linkedin: '', outreach: '', brief: '', progress: '' }
  return h('section', { class: 'screen' },
    h('div', {}, h('span', { class: 'note' }, 'your toolkit'), h('h2', {}, 'Tools'), h('p', { class: 'muted' }, 'These save to your account, and Sky knows about your tasks.')),
    TOOL_GROUPS.map(([group, items]) => [h('h3', { class: 'group' }, group), h('div', { class: 'toolgrid' }, items.map(([id, name, blurb]) =>
      h('button', { class: 'toolcard', type: 'button', onclick: () => go('tools', id) },
        h('b', {}, name), h('span', {}, blurb), status[id] && h('small', {}, status[id]))))]),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'Need to talk something through?'),
      h('p', { class: 'small' }, 'Sky, your AI Coach, is in the Coach tab, with nine focus areas: career, recovery, action, interview, decisions and more.'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go('coach') }, 'Talk to Sky')))
}

// ── Me ───────────────────────────────────────────────────────────
function meScreen() {
  const me = S.me
  const ci = S.checkin
  const allAnswered = STATEMENTS.every(s => ci[s.key])
  return h('section', { class: 'screen' },
    h('h2', {}, 'Me'),
    S.checkinResult ? checkinResultCard() : h('form', { class: 'card', novalidate: true, onsubmit: async e => {
      e.preventDefault()
      if (!allAnswered) { S.error = 'Please answer all eight statements.'; render(); return }
      S.busy = true; render()
      try { const d = await act('checkin', { answers: { ...ci } }); S.checkinResult = d?.result || null; S.checkin = {} } catch (err) { S.error = err.message }
      S.busy = false; render(); window.scrollTo({ top: 0 })
    } },
      h('span', { class: 'label' }, 'Check-in'),
      h('p', { class: 'muted' }, me.plan ? 'Retake it any time to see how far you’ve moved. It takes about two minutes.' : 'Two minutes. It places you and gives you your plan for the four weeks.'),
      h('p', { class: 'small' }, 'How much is each of these like you right now?'),
      STATEMENTS.map(s => h('div', { class: 'stmt' }, h('p', {}, s.text),
        h('div', { class: 'chips', role: 'group', 'aria-label': s.text }, SCALE.map((l, i) =>
          h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ci[s.key] === i + 1), onclick: () => { ci[s.key] = i + 1; render() } }, l))))),
      h('div', { class: 'stmt' }, h('p', {}, 'Over the last couple of weeks, how have you been feeling overall? (optional)'),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'How have you been feeling' }, FEELINGS.map((l, i) =>
          h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ci.feel === i + 1), onclick: () => { ci.feel = ci.feel === i + 1 ? undefined : i + 1; render() } }, l)))),
      S.error && h('p', { class: 'error', role: 'alert' }, S.error),
      h('button', { class: 'btn btn-primary', type: 'submit', disabled: S.busy }, S.busy ? 'Saving…' : 'Save my check-in')),
    me.checkins.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Your check-ins'),
      h('ul', { class: 'hist', style: { margin: 0, padding: 0, 'list-style': 'none' } }, [...me.checkins].reverse().map(c =>
        h('li', {}, h('span', {}, fmtDate(c.at)), h('b', {}, QUADRANTS[c.quadrant].name), h('span', { class: 'muted' }, `clarity ${c.clarity}, capacity ${c.capacity}`))))),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'What Sky remembers'),
      me.memory.length ? [me.memory.map(m => h('div', { class: 'mem' }, h('span', {}, m.note),
        h('button', { class: 'x', type: 'button', 'aria-label': `Forget: ${m.note}`, onclick: async () => { try { await act('memory_delete', { id: m.id }) } catch (err) { S.error = err.message } render() } }, '×'))),
        h('button', { class: 'link-btn', type: 'button', onclick: async () => { try { await act('memory_delete', { all: true }) } catch (err) { S.error = err.message } render() } }, 'Forget everything')]
        : h('p', { class: 'muted small' }, 'Nothing yet. When Sky saves a note to help it remember you, it appears here. You can delete any of it, any time.'),
      h('p', { class: 'small muted' }, 'Vik can also see your plan, progress and check-ins to prepare for your session.')),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'Your account'),
      h('dl', { class: 'kv' }, h('dt', {}, 'Name'), h('dd', {}, me.member.name || '—'), h('dt', {}, 'Email'), h('dd', {}, me.member.email),
        h('dt', {}, 'Started'), h('dd', {}, new Date(me.member.startedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: signOut }, 'Sign out')),
    h('div', { class: 'card' }, h('span', { class: 'label' }, 'Support, any time'),
      h('p', { class: 'small' }, 'Lifeline 13 11 14 (24/7) · Beyond Blue 1300 22 4636 · 13YARN 13 92 76 · Emergency 000')))
}

function checkinResultCard() {
  const r = S.checkinResult, Q = QUADRANTS[r.quadrant]
  return h('div', { class: 'card', style: { '--hlc': Q.color } },
    h('span', { class: 'note' }, 'saved'),
    h('p', { style: { 'font-family': 'var(--display)', 'font-weight': '700', 'font-size': '28px' } }, 'You’re in ', h('span', { class: 'hl' }, Q.name), '.'),
    h('p', { class: 'muted' }, Q.tag),
    r.struggling && h('div', { class: 'crisis', role: 'alert' }, h('b', {}, 'Thanks for being honest.'), h('p', {}, 'It sounds like things are really hard right now. Your career can wait. Lifeline 13 11 14 (24/7) · Beyond Blue 1300 22 4636 · Emergency 000.')),
    r.lowMood && !r.struggling && h('p', { class: 'small' }, 'You mentioned feeling low. Go easy on yourself, and if things get heavier, Lifeline is there on 13 11 14, any time.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { S.checkinResult = null; go('today') } }, 'Back to today'))
}

// ── Shell ────────────────────────────────────────────────────────
const ICONS = {
  today: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  plan: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  coach: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
}
const TABS = [['today', 'Today'], ['plan', 'Program'], ['coach', 'Coach'], ['tools', 'Tools'], ['me', 'Me']]

function go(tab, sub) {
  if (S.tab === 'tools' && S.tool === 'notes' && !(tab === 'tools' && sub === 'notes')) flushNotes(ctx)
  S.tab = tab; S.error = ''; S.lessonId = null
  S.tool = tab === 'tools' ? sub || null : null
  try { history.replaceState(null, '', `#${tab}${S.tool ? '/' + S.tool : ''}`) } catch {}
  render(); window.scrollTo({ top: 0 })
  if (tab === 'coach') setTimeout(scrollChat, 0)
}

function renderTabs() {
  const show = S.me && !['login', 'sent', 'loading', 'noaccess'].includes(S.screen)
  tabbar.hidden = !show
  signoutBtn.hidden = !show
  if (!show) return
  tabbar.replaceChildren(h('div', { class: 'tabbar-in' }, TABS.map(([k, label]) => {
    const needsCheckin = k === 'me' && !S.me.plan
    const btn = h('button', { class: 'tab', type: 'button', 'aria-current': S.tab === k ? 'page' : null, onclick: () => { go(k); if (k === 'coach' && !skySeen()) setTimeout(() => openSky(ctx), 250) } }, label, needsCheckin && h('span', { class: 'dotbadge', 'aria-label': 'Check-in needed' }))
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = ICONS[k] // fixed strings above, never user data
    btn.prepend(svg)
    return btn
  })))
}

function render() {
  const active = document.activeElement?.id
  const sel = document.activeElement?.selectionStart
  let node
  if (S.screen === 'loading') node = h('p', { class: 'loading' }, 'Loading…')
  else if (S.screen === 'login') node = loginScreen()
  else if (S.screen === 'sent') node = sentScreen()
  else if (S.screen === 'noaccess') node = noAccessScreen()
  else if (S.lessonId) node = lessonScreen()
  else node = ({ today: todayScreen, plan: planScreen, coach: coachScreen, tools: toolsScreen, me: meScreen }[S.tab] || todayScreen)()
  app.replaceChildren(node)
  document.querySelector('.paper')?.classList.toggle('wide', S.screen === 'app' && ((S.tab === 'tools' && !!S.tool) || S.tab === 'today' || S.tab === 'plan'))
  renderTabs()
  if (active) { const el = document.getElementById(active); if (el) { el.focus(); if (sel != null && el.setSelectionRange) try { el.setSelectionRange(sel, sel) } catch {} } }
}

// ── Start ────────────────────────────────────────────────────────
async function start() {
  const url = new URL(location.href)
  const token = url.searchParams.get('t')
  if (token) {
    history.replaceState(null, '', location.pathname + location.hash)
    try {
      const d = await call('/api/newpage/auth', { action: 'verify', token }, null)
      session = d.session
      try { localStorage.setItem(KEY, session) } catch {}
    } catch (e) {
      S.screen = 'login'; S.info = e.message; render(); return
    }
  }
  if (!session) { S.screen = 'login'; render(); return }
  render()
  try {
    if (!(await act('me'))) return
    const [wanted, sub] = location.hash.slice(1).split('/')
    if (wanted === 'lesson' && sub) { S.lessonId = sub; S.tab = 'plan' }
    S.tab = S.lessonId ? 'plan' : TABS.some(([k]) => k === wanted) ? wanted : 'today'
    S.tool = S.tab === 'tools' && TOOLS.some(([k]) => k === sub) ? sub : null
    S.screen = 'app'
    const paid = new URL(location.href).searchParams.get('paid')
    if (paid) { S.info = paid === 'renew' ? 'Thanks. Your renewal is being applied. If it doesn’t show within a minute, refresh this page.' : 'Thanks. Your extra hours are being added. If they don’t show within a minute, refresh this page.'; history.replaceState(null, '', location.pathname + location.hash) }
  } catch (e) {
    S.screen = 'login'; S.info = e.message
  }
  render()
}
start()
