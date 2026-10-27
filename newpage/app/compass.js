// The Compass: ten short steps from values to first steps, saved to the
// member's account. Suggestions come from the server (Claude).
import { h, todayStr, addDays, words, copyText } from './ui.js'

const VALUES = ['Achievement', 'Adventure', 'Balance', 'Beauty', 'Belonging', 'Calm', 'Care', 'Community', 'Courage', 'Creativity', 'Culture', 'Curiosity', 'Faith', 'Fairness', 'Family', 'Freedom', 'Friendship', 'Fun', 'Growth', 'Health', 'Home', 'Honesty', 'Hope', 'Humour', 'Independence', 'Joy', 'Justice', 'Kindness', 'Learning', 'Love', 'Loyalty', 'Making a difference', 'Money', 'Nature', 'Peace', 'Purpose', 'Respect', 'Security', 'Simplicity', 'Spirituality', 'Stability', 'Success', 'Teamwork', 'Trust', 'Wisdom']
export const COMPASS_STEPS = ['Values', 'Who I am', 'North Star', 'What I need', 'Strengths', 'Mix ideas', 'Choose', 'Plan', 'First steps', 'Calendar']

const T = { C: null, loading: false, err: '', busy: '', trios: [], seen: new Set(), inp: {}, sched: [], placed: false, notice: '' }

const iam = s => {
  s = String(s || '').trim().replace(/^i\s*am\s*/i, '').trim()
  if (!s) return ''
  if (/^(a|an)\s/i.test(s)) return 'I am ' + s.replace(/^(a|an)\s+/i, m => m.toLowerCase())
  return 'I am ' + (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s
}

let saveTimer = null
let dirty = false
function send(ctx, keepalive) {
  clearTimeout(saveTimer); dirty = false
  const req = { action: 'tool_save', tool: 'compass', data: T.C }
  return keepalive ? ctx.beacon('/api/newpage/app', req) : ctx.call('/api/newpage/app', req).catch(() => {})
}
// Typing is saved after a short pause; clicks and step changes save at once.
function save(ctx, now = true) {
  dirty = true
  clearTimeout(saveTimer)
  if (now) send(ctx, false)
  else saveTimer = setTimeout(() => send(ctx, false), 600)
}
let hooked = false
function hook(ctx) {
  if (hooked) return
  hooked = true
  const flush = () => { if (dirty && T.C) send(ctx, true) }
  addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}

export async function compassStatus(ctx) {
  if (!T.C) { try { T.C = (await ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'compass' })).data } catch {} }
  return T.C
}

async function ensureLoaded(ctx) {
  if (T.C || T.loading) return
  T.loading = true
  try { T.C = (await ctx.call('/api/newpage/app', { action: 'tool_get', tool: 'compass' })).data } catch (e) { T.err = e.message }
  T.loading = false
  ctx.render()
}

async function suggest(ctx, kind, data, key) {
  T.busy = key; T.err = ''; ctx.render()
  try { return (await ctx.call('/api/newpage/app', { action: 'compass_suggest', kind, data, compass: T.C })).result }
  catch (e) { T.err = e.code === 'coach_off' ? 'Suggestions aren’t switched on yet. You can still do every step yourself.' : e.message; return null }
  finally { T.busy = ''; ctx.render() }
}

function makeTrios(G, n = 10) {
  const all = []
  for (const k of G.know) for (const d of G.do) for (const l of G.love) all.push({ know: k, do: d, love: l })
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]] }
  const key = t => `${t.know}|${t.do}|${t.love}`
  let fresh = all.filter(t => !T.seen.has(key(t)))
  if (fresh.length < n) { T.seen.clear(); fresh = all }
  const out = fresh.slice(0, n).map(t => ({ ...t, idea: '', added: [] }))
  out.forEach(t => T.seen.add(key(t)))
  return out
}

function rankList(arr, onChange, label) {
  return h('ol', { class: 'rank', 'aria-label': label }, arr.map((v, i) => h('li', {},
    h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'v' }, v),
    h('button', { class: 'mv', type: 'button', disabled: i === 0, 'aria-label': `Move ${v} up`, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; onChange() } }, '↑'),
    h('button', { class: 'mv', type: 'button', disabled: i === arr.length - 1, 'aria-label': `Move ${v} down`, onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; onChange() } }, '↓'),
    h('button', { class: 'mv', type: 'button', 'aria-label': `Remove ${v}`, onclick: () => { arr.splice(i, 1); onChange() } }, '×'))))
}

function tagList(arr, onChange) {
  return arr.length ? h('div', { class: 'tags' }, arr.map((v, i) => h('span', { class: 'tag' }, v, h('button', { type: 'button', 'aria-label': `Remove ${v}`, onclick: () => { arr.splice(i, 1); onChange() } }, '×')))) : null
}

function addRow(ctx, id, placeholder, onAdd, prefix) {
  const go = () => { const v = (T.inp[id] || '').trim(); if (!v) return; T.inp[id] = ''; onAdd(v); ctx.render(); document.getElementById(id)?.focus() }
  return h('div', { class: 'add-row' },
    prefix && h('span', { class: 'pre' }, prefix),
    h('input', { id, type: 'text', maxlength: '100', placeholder, 'aria-label': placeholder, value: T.inp[id] || '', oninput: e => { T.inp[id] = e.target.value }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); go() } } }),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: go }, 'Add'))
}

// What's still needed to leave each step.
function missing(C, step) {
  const m = []
  const need = (n, have, what) => { if (have < n) m.push(`${n - have} more ${what}`) }
  if (step === 0) need(5, C.values.length, 'value' + (5 - C.values.length === 1 ? '' : 's'))
  if (step === 1) need(3, C.iAm.length, '“I am” statement' + (3 - C.iAm.length === 1 ? '' : 's'))
  if (step === 2 && words(C.north) < 15) m.push('a few more sentences (15 words or more)')
  if (step === 3) { const n = C.needs; if (n.pay === '') m.push('lowest pay'); if (!n.hours) m.push('hours a week'); if (!n.stress) m.push('how much stress is OK'); if (!n.mode) m.push('where you want to work') }
  if (step === 4) { for (const [k, l] of [['know', 'thing you know'], ['do', 'thing you can do'], ['love', 'thing you love']]) if (C.strengths[k].length < 3) m.push(`${3 - C.strengths[k].length} more ${l}${3 - C.strengths[k].length === 1 ? '' : 's'}`) }
  if (step === 5 && C.ideas.length < 1) m.push('at least one idea')
  if (step === 6 && !C.first) m.push('your top pick')
  return m
}

export function compassScreen(ctx) {
  ensureLoaded(ctx)
  const back = h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools')
  if (!T.C) return h('section', { class: 'screen' }, back, h('h2', {}, 'The Compass'), T.err ? h('p', { class: 'error' }, T.err) : h('p', { class: 'loading' }, 'Loading…'))

  hook(ctx)
  const C = T.C
  const step = C.step
  const rr = () => { save(ctx); ctx.render() }
  const quiet = () => save(ctx, false)
  const go = n => { C.step = Math.max(0, Math.min(9, n)); T.err = ''; save(ctx); ctx.render(); window.scrollTo({ top: 0 }) }
  const body = []

  if (step === 0) {
    body.push(h('h3', {}, 'What matters most to you?'), h('p', { class: 'muted' }, 'Tap the values that feel like you. Choose between 5 and 10, then put them in order. The top one is your #1.'),
      h('div', { class: 'chips' }, [...VALUES, ...C.values.filter(v => !VALUES.includes(v))].map(v => {
        const on = C.values.includes(v)
        return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(on), disabled: !on && C.values.length >= 10, onclick: () => { if (on) C.values = C.values.filter(x => x !== v); else C.values.push(v); rr() } }, v)
      })),
      addRow(ctx, 'cp-value', 'Missing one? Add your own', v => { if (C.values.length < 10 && !C.values.includes(v)) C.values.push(v); save(ctx) }),
      C.values.length > 0 && [h('span', { class: 'label' }, 'Your values in order'), rankList(C.values, rr, 'Your values in order')])
  } else if (step === 1) {
    body.push(h('h3', {}, 'Who are you?'), h('p', { class: 'muted' }, 'Write some “I am a…” or “I am an…” statements: who you’ve been, who you are now, or who you’d love to be. Think about all of your life, not just work. Then put them in order of what feels most true today.'),
      addRow(ctx, 'cp-iam', 'e.g. mum, gardener, artist, teacher', v => { const t = iam(v); if (t && !C.iAm.includes(t) && C.iAm.length < 12) C.iAm.push(t); save(ctx) }, 'I am a/an'),
      C.iAm.length > 0 && rankList(C.iAm, rr, 'Your I am statements in order'))
  } else if (step === 2) {
    const wc = h('div', { class: 'small muted', id: 'cp-wc' }, `${words(C.north)} words`)
    body.push(h('h3', {}, 'Your North Star'), h('p', { class: 'muted' }, 'Picture your #1 value fully lived by your #1 “I am”. Describe the most exciting version you can imagine, in any part of life. Work is there to support it.'),
      h('div', { class: 'anchor' }, h('div', {}, h('span', {}, '#1 value'), h('b', {}, C.values[0] || '—')), h('div', {}, h('span', {}, '#1 I am'), h('b', {}, C.iAm[0] || '—'))),
      h('ul', { class: 'prompts' }, ['Where are you, and who’s with you?', 'What does an ordinary day look like?', 'What are you doing, making or giving?', 'How does it feel?'].map(t => h('li', {}, t))),
      h('div', { class: 'field' }, h('textarea', { id: 'cp-north', rows: '8', maxlength: '3000', 'aria-label': 'Your North Star', placeholder: 'Write in your own words…', oninput: e => { C.north = e.target.value; wc.textContent = `${words(C.north)} words`; quiet(); refreshFooter() } }, C.north)), wc)
  } else if (step === 3) {
    const N = C.needs
    const opts = (key, list) => h('div', { class: 'chips' }, list.map(v => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(N[key] === v), onclick: () => { N[key] = v; rr() } }, v)))
    body.push(h('h3', {}, 'What do you need from work?'), h('p', { class: 'muted' }, 'The practical things a job has to have for it to work in your life.'),
      h('div', { class: 'two' },
        h('div', { class: 'field' }, h('label', { for: 'cp-pay' }, 'Lowest pay I can accept (per year, before tax)'), h('input', { id: 'cp-pay', type: 'text', inputmode: 'numeric', maxlength: '12', placeholder: 'e.g. 75000', value: N.pay, oninput: e => { N.pay = e.target.value.replace(/[^\d]/g, ''); quiet(); refreshFooter() } })),
        h('div', { class: 'field' }, h('label', { for: 'cp-hours' }, 'Most hours I want to work a week'), h('input', { id: 'cp-hours', type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: 'e.g. 38', value: N.hours, oninput: e => { N.hours = e.target.value.replace(/[^\d]/g, ''); quiet(); refreshFooter() } }))),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'How much stress is OK?'), opts('stress', ['Low', 'Some', 'A lot is fine'])),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Where do you want to work?'), opts('mode', ['From home', 'Mix of home and on-site', 'On-site', 'Don’t mind'])),
      h('div', { class: 'field' }, h('label', { for: 'cp-loc' }, 'Location (optional)'), h('input', { id: 'cp-loc', type: 'text', maxlength: '100', placeholder: 'e.g. Parramatta, no long drives', value: N.location, oninput: e => { N.location = e.target.value; quiet() } })),
      h('div', { class: 'field' }, h('label', { for: 'cp-other' }, 'Anything else that has to be true? (optional)'), h('textarea', { id: 'cp-other', rows: '2', maxlength: '300', placeholder: 'e.g. School pick-up on Wednesdays', oninput: e => { N.other = e.target.value; quiet() } }, N.other)))
  } else if (step === 4) {
    const G = C.strengths
    const cats = [['know', 'Things I know', 'Topics, places, cultures, industries, life experience', 'e.g. Gardening, NDIS, Tamil culture'], ['do', 'Things I can do', 'Skills, practical or people-based', 'e.g. Calm people down, fix bikes, write'], ['love', 'Things I love', 'What makes your heart sing, or your blood boil', 'e.g. Kids’ wellbeing, live music, fairness'], ['other', 'Other things I bring (optional)', 'People you know, places you can access, things you own', 'e.g. A big local network, a ute']]
    body.push(h('h3', {}, 'Your strengths'), h('p', { class: 'muted' }, 'Three groups: what you know, what you can do, and what you love. At least three in each. More is better.'),
      h('div', { class: 'mixgrid' }, cats.map(([k, label, hint, ph]) => h('div', { class: 'card' }, h('span', { class: 'label' }, label, k !== 'other' && h('small', {}, ` ${G[k].length}/3`)), h('p', { class: 'small muted' }, hint), tagList(G[k], rr), addRow(ctx, 'cp-s-' + k, ph, v => { if (G[k].length < 20 && !G[k].includes(v)) G[k].push(v); save(ctx) })))))
  } else if (step === 5) {
    const G = C.strengths
    if (!T.trios.length || T.trios.some(t => !G.know.includes(t.know) || !G.do.includes(t.do) || !G.love.includes(t.love))) T.trios = makeTrios(G)
    const addIdea = (v, t) => { if (v && !C.ideas.includes(v) && C.ideas.length < 30) { C.ideas.push(v); if (t) t.added.push(v) } }
    body.push(h('h3', {}, 'Mix and match'), h('p', { class: 'muted' }, 'Each card mixes one thing you know, one you can do and one you love. Ask: what job or kind of work could bring these together? Skip any that don’t spark anything. Add the ideas you already had too.'),
      h('div', { class: 'mixgrid' }, T.trios.map((t, j) => h('div', { class: 'card mix' },
        h('div', { class: 'trio' }, h('span', {}, t.know), '+', h('span', {}, t.do), '+', h('span', {}, t.love)),
        t.added.length > 0 && h('div', { class: 'tags' }, t.added.map(v => h('span', { class: 'tag got' }, '✓ ' + v))),
        h('div', { class: 'add-row' },
          h('input', { id: 'cp-mix-' + j, type: 'text', maxlength: '100', placeholder: t.added.length ? 'Another idea?' : 'What work could this be?', 'aria-label': `Idea for mix ${j + 1}`, value: t.idea, oninput: e => { t.idea = e.target.value }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); addIdea(t.idea.trim(), t); t.idea = ''; rr() } } }),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { addIdea(t.idea.trim(), t); t.idea = ''; rr() } }, 'Add')),
        h('button', { class: 'link-btn blue', type: 'button', disabled: !!T.busy, onclick: async () => { const r = await suggest(ctx, 'mixIdea', { know: t.know, do: t.do, love: t.love, avoid: [...t.added, ...C.ideas] }, 'mix' + j); if (r?.idea) { t.idea = r.idea; ctx.render() } } }, T.busy === 'mix' + j ? 'Thinking…' : 'Suggest an idea for this mix')))),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { T.trios = makeTrios(G); ctx.render(); window.scrollTo({ top: 0 }) } }, 'Remix: 10 new mixes'),
      h('div', { class: 'card' }, h('span', { class: 'label' }, `Your ideas (${C.ideas.length})`),
        tagList(C.ideas, rr) || h('p', { class: 'muted small' }, 'Ideas you add appear here.'),
        addRow(ctx, 'cp-idea', 'An idea you already had', v => { addIdea(v); save(ctx) }),
        h('button', { class: 'btn btn-secondary', type: 'button', disabled: !!T.busy, onclick: async () => { const r = await suggest(ctx, 'ideas', {}, 'ideas'); if (r?.ideas) { T.sugg = r.ideas; ctx.render() } } }, T.busy === 'ideas' ? 'Thinking…' : 'Suggest 5 more ideas from my answers'),
        (T.sugg || []).map(s => h('div', { class: 'sugg' }, h('b', {}, s.title), h('p', { class: 'small muted' }, `${s.know} + ${s.do} + ${s.love}. ${s.why}`),
          h('button', { class: 'chip', type: 'button', disabled: C.ideas.includes(s.title), onclick: () => { addIdea(s.title); rr() } }, C.ideas.includes(s.title) ? 'Added' : 'Add to my ideas')))))
  } else if (step === 6) {
    body.push(h('h3', {}, 'Choose your direction'), h('p', { class: 'muted' }, 'Notice which ideas light you up. Choose your top pick, and a second if you like. You can always change your mind.'),
      C.ideas.length ? h('div', { class: 'card' }, C.ideas.map(v => h('div', { class: 'pick' }, h('span', {}, v),
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(C.first === v), onclick: () => { C.first = C.first === v ? '' : v; if (C.second === v) C.second = ''; rr() } }, 'Top pick'),
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(C.second === v), disabled: C.first === v, onclick: () => { C.second = C.second === v ? '' : v; rr() } }, 'Second')))) : h('p', { class: 'muted' }, 'Go back and add some ideas first.'),
      addRow(ctx, 'cp-idea2', 'Add another idea', v => { if (!C.ideas.includes(v)) C.ideas.push(v); save(ctx) }),
      h('button', { class: 'link-btn blue', type: 'button', onclick: () => ctx.askCoach('clarity', 'I’m choosing between some career ideas and I’d like help thinking it through. ') }, 'Stuck? Talk it through with the Clarity Compass coach'))
  } else if (step === 7) {
    const P = C.plan
    const fields = [['now', 'Now (the next 3 months)'], ['building', 'Building (3 to 9 months)'], ['move', 'The move (9 to 18 months)'], ['longer', 'Longer term (18 months and beyond)']]
    body.push(h('h3', {}, 'Sketch your path'), h('p', { class: 'muted' }, `A few sentences each toward ${C.first || 'your direction'}. Rough is fine.`),
      fields.map(([k, label]) => h('div', { class: 'field' }, h('label', { for: 'cp-p-' + k }, label), h('textarea', { id: 'cp-p-' + k, rows: '3', maxlength: '1200', oninput: e => { P[k] = e.target.value; quiet() } }, P[k]))),
      h('button', { class: 'btn btn-secondary', type: 'button', disabled: !!T.busy, onclick: async () => { const r = await suggest(ctx, 'plan', {}, 'plan'); if (r) { for (const [k] of fields) if (!P[k].trim() && r[k]) P[k] = r[k]; rr() } } }, T.busy === 'plan' ? 'Thinking…' : 'Suggest a path for the empty boxes'))
  } else if (step === 8) {
    const A = C.actions
    while (A.length < 3) A.push('')
    body.push(h('h3', {}, 'Three small first steps'), h('p', { class: 'muted' }, 'Things you can do in the next two weeks. Each takes under two hours and starts with a doing word: call, write, visit, sign up.'),
      A.slice(0, 3).map((a, i) => h('div', { class: 'field' }, h('label', { for: 'cp-a-' + i }, `Step ${i + 1}`), h('input', { id: 'cp-a-' + i, type: 'text', maxlength: '200', value: a, oninput: e => { A[i] = e.target.value; quiet() } }))),
      h('button', { class: 'btn btn-secondary', type: 'button', disabled: !!T.busy, onclick: async () => { const r = await suggest(ctx, 'steps', {}, 'steps'); if (r?.steps) { let j = 0; for (let i = 0; i < 3; i++) if (!A[i].trim() && r.steps[j]) A[i] = r.steps[j++]; rr() } } }, T.busy === 'steps' ? 'Thinking…' : 'Suggest steps for the empty ones'))
  } else {
    const steps = C.actions.filter(a => a.trim())
    if (T.sched.length !== steps.length) T.sched = steps.map((a, i) => ({ title: a, date: addDays(todayStr(), 2 + i * 3), time: '10:00', mins: 60 }))
    body.push(h('h3', {}, 'Put it in your planner'), h('p', { class: 'muted' }, 'Give each first step a time so it actually happens. They go into your planner, and you can add them to your calendar from there.'),
      T.sched.map((s, i) => h('div', { class: 'card' }, h('p', {}, h('b', {}, s.title)),
        h('div', { class: 'when' }, h('input', { type: 'date', value: s.date, 'aria-label': `Date for step ${i + 1}`, oninput: e => { s.date = e.target.value } }), h('input', { type: 'time', value: s.time, 'aria-label': `Time for step ${i + 1}`, oninput: e => { s.time = e.target.value } })))),
      !steps.length && h('p', { class: 'muted' }, 'Go back and add your first steps.'),
      steps.length > 0 && (T.placed
        ? h('p', { class: 'soft' }, 'Added to your planner. ', h('button', { class: 'link-btn blue', type: 'button', onclick: () => ctx.go('tools', 'planner') }, 'Open the planner'))
        : h('button', { class: 'btn btn-primary', type: 'button', disabled: T.busy === 'place', onclick: async () => {
            T.busy = 'place'; ctx.render()
            try { for (const s of T.sched) await ctx.act('task_add', { title: s.title, due: s.date, start: s.time, mins: s.mins }); T.placed = true; C.done = true; save(ctx) } catch (e) { T.err = e.message }
            T.busy = ''; ctx.render()
          } }, T.busy === 'place' ? 'Adding…' : 'Add to my planner')),
      C.done && summary(ctx, C))
  }

  const footer = h('div', { class: 'cp-footer' }, h('p', { class: 'small muted', id: 'cp-hint', 'aria-live': 'polite' }),
    h('div', { class: 'row' },
      step > 0 && h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go(step - 1) }, 'Back'),
      step < 9 && h('button', { id: 'cp-next', class: 'btn btn-primary', type: 'button', onclick: () => { if (missing(C, step).length) { refreshFooter(true); return } go(step + 1) } }, 'Next')))
  function refreshFooter(force) {
    const m = missing(C, step)
    const hint = document.getElementById('cp-hint'), next = document.getElementById('cp-next')
    if (hint) hint.textContent = m.length ? 'Still needed: ' + m.join(', ') : ''
    if (next) next.setAttribute('aria-disabled', String(m.length > 0))
  }
  setTimeout(refreshFooter, 0)

  return h('section', { class: 'screen compass' },
    h('div', {}, back, h('span', { class: 'note' }, 'the compass'), h('h2', {}, COMPASS_STEPS[step])),
    h('div', { class: 'cp-steps', role: 'list', 'aria-label': 'Steps' }, COMPASS_STEPS.map((s, i) => h('span', { role: 'listitem', class: i === step ? 'on' : i < step ? 'past' : '', 'aria-current': i === step ? 'step' : null, 'aria-label': `Step ${i + 1}: ${s}` }))),
    h('p', { class: 'small muted' }, `Step ${step + 1} of 10 · saved as you go`),
    T.err && h('p', { class: 'error', role: 'alert' }, T.err),
    h('div', { class: 'cp-body' }, body),
    footer)
}

function summary(ctx, C) {
  const text = [
    `My values: ${C.values.join(', ')}`, `I am: ${C.iAm.join('; ')}`, `My North Star: ${C.north}`,
    `Direction: ${C.first}${C.second ? ` (second: ${C.second})` : ''}`,
    `Now: ${C.plan.now}`, `Building: ${C.plan.building}`, `The move: ${C.plan.move}`, `Longer term: ${C.plan.longer}`,
    `First steps: ${C.actions.filter(Boolean).join('; ')}`
  ].join('\n\n')
  return h('div', { class: 'card summary' }, h('span', { class: 'label' }, 'Your Compass'),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Values'), h('dd', {}, C.values.slice(0, 5).join(', ')),
      h('dt', {}, 'I am'), h('dd', {}, C.iAm.slice(0, 3).join('; ')),
      h('dt', {}, 'Direction'), h('dd', {}, C.first || '—')),
    h('p', { class: 'small' }, C.north),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: e => copyText(text, e.currentTarget) }, 'Copy my Compass'),
    h('p', { class: 'small muted' }, 'Your coaches know your direction and values. Bring this to your session with Vik.'))
}
