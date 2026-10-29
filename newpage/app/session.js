// Booking the 1:1 session with Vik that comes with New Page.
import { h, todayStr, addDays, fmtDay } from './ui.js'

const L = { date: '', slots: null, loading: false, err: '', picked: null, busy: false, done: null }

const fmtTime = t => { const [hh, mm] = t.split(':').map(Number); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}` }

async function loadSlots(ctx, date) {
  L.date = date; L.slots = null; L.picked = null; L.err = ''; L.loading = true; ctx.render()
  try { L.slots = (await ctx.call('/api/newpage/app', { action: 'slots', date })).slots } catch (e) { L.err = e.message; L.slots = [] }
  L.loading = false; ctx.render()
}

const B = { hours: 1 }
function buyHours(ctx, me) {
  if (!me.member.canBuy) return h('p', { class: 'small muted' }, 'Want more time with Vik? Reply to any email from him.')
  const max = me.prices.maxHours, per = me.prices.hourCents / 100
  return h('div', {},
    h('p', { class: 'small muted' }, `Want more time with Vik? Extra hours are $${per} each, up to ${max} at a time.`),
    h('div', { class: 'stepper-row' },
      h('button', { class: 'step-btn', type: 'button', 'aria-label': 'One fewer hour', disabled: B.hours <= 1, onclick: () => { B.hours--; ctx.render() } }, '−'),
      h('output', { 'aria-live': 'polite' }, `${B.hours} hour${B.hours === 1 ? '' : 's'}`),
      h('button', { class: 'step-btn', type: 'button', 'aria-label': 'One more hour', disabled: B.hours >= max, onclick: () => { B.hours++; ctx.render() } }, '+')),
    ctx.S.error && h('p', { class: 'error', role: 'alert' }, ctx.S.error),
    h('button', { class: 'btn btn-primary', type: 'button', disabled: ctx.S.busy, onclick: () => ctx.buy('hours_checkout', { hours: B.hours }) }, ctx.S.busy ? 'One moment…' : `Buy ${B.hours} hour${B.hours === 1 ? '' : 's'} for $${B.hours * per}`),
    h('p', { class: 'small muted' }, 'You pay on a secure Stripe page, then come back here to book.'))
}

export function sessionScreen(ctx) {
  const me = ctx.S.me, s = me.sessions
  const back = h('button', { class: 'link-btn back', type: 'button', onclick: () => { L.done = null; ctx.go('tools') } }, '← Tools')
  const head = h('div', {}, back, h('h2', {}, '1:1 with Vik'), h('p', { class: 'muted' }, 'A 60-minute online session with Vik, a career counsellor and psychotherapist. He sees your plan and progress beforehand, so you start where you are.'))

  const upcoming = s.upcoming.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, 'Booked'),
    s.upcoming.map(u => h('p', {}, h('b', {}, `${fmtDay(u.date)}, ${fmtTime(u.time)}`), ' (Sydney time). The link and calendar invite are in your email.')),
    h('p', { class: 'small muted' }, 'Need to change it? Reply to the confirmation email and Vik will sort it out.'))

  if (L.done) {
    return h('section', { class: 'screen' }, head,
      h('div', { class: 'card' }, h('span', { class: 'note' }, 'booked'), h('p', {}, h('b', {}, `${fmtDay(L.done.date)}, ${fmtTime(L.done.time)}`), ' (Sydney time).'),
        h('p', {}, 'A confirmation with the video link is on its way to ', h('b', {}, me.member.email), '.'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { L.done = null; ctx.go('today') } }, 'Back to today')))
  }

  if (s.remaining < 1) {
    return h('section', { class: 'screen' }, head, upcoming,
      !s.upcoming.length && h('div', { class: 'card' }, h('p', {}, 'You’ve used the session included in New Page.'), buyHours(ctx, me)))
  }

  const min = addDays(todayStr(), 1)
  const picker = h('div', { class: 'card' },
    h('span', { class: 'label' }, `Choose a time · ${s.remaining} session${s.remaining === 1 ? '' : 's'} included`),
    h('div', { class: 'field' }, h('label', { for: 'sess-date' }, 'Day'),
      h('input', { id: 'sess-date', type: 'date', min, max: addDays(todayStr(), 60), value: L.date, onchange: e => { if (e.target.value) loadSlots(ctx, e.target.value) } })),
    L.loading && h('p', { class: 'muted small' }, 'Checking Vik’s diary…'),
    L.slots && !L.loading && (L.slots.length
      ? h('div', {}, h('p', { class: 'small muted' }, 'Times are Sydney time.'), h('div', { class: 'chips' }, L.slots.map(sl => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(L.picked === sl.hour), onclick: () => { L.picked = sl.hour; ctx.render() } }, sl.label))))
      : h('p', { class: 'muted' }, 'Nothing free that day. Try another day. (Sessions need at least 24 hours’ notice.)')),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    L.picked != null && h('button', { class: 'btn btn-primary', type: 'button', disabled: L.busy, onclick: async () => {
      L.busy = true; L.err = ''; ctx.render()
      try { const d = await ctx.act('session_book', { date: L.date, hour: L.picked }); L.done = d.booked; L.slots = null; L.picked = null; L.date = '' }
      catch (e) { L.err = e.message; if (e.code === 'taken') { loadSlots(ctx, L.date) } }
      L.busy = false; ctx.render()
    } }, L.busy ? 'Booking…' : `Book ${fmtDay(L.date)} at ${L.slots?.find(x => x.hour === L.picked)?.label || ''}`))

  return h('section', { class: 'screen' }, head, upcoming, picker)
}
