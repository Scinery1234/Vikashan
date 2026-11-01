// The emails Vik sends during the four weeks: a nudge at the start of weeks 2, 3
// and 4, "book your session", the renewal email near the end, a gentle "gone
// quiet" note, and the receipt after a payment. The wording is in PROGRAM_MAILS
// so it can be edited from /newpage/admin/content, like the follow-up emails.
//
// Placeholders in the text: {first} {week} {week_title} {week_goal} {first_task}
// {days_left} {price} {sessions_left}
import { esc, layout, button, P, APP_URL } from './newpage-emails.js'
import { PROGRAM } from '../newpage/program-content.js'
import { PRICE } from './newpage-pricing.js'
import { programPosition } from './newpage-app.js'

const DAY = 24 * 60 * 60 * 1000

export const PROGRAM_MAILS = {
  week: {
    subject: 'Week {week}: {week_title}',
    paras: [
      'Week {week} of New Page starts today. This week is about: {week_goal}',
      'The first thing to do: {first_task}',
      'Ten minutes is enough to get going. If you’re stuck, tell Sky where you’re at and it will help you find the next small step.'
    ],
    button: 'Open this week'
  },
  book: {
    subject: 'Book your 1:1 session with me',
    paras: [
      'You get one 60-minute session with me as part of New Page, and you haven’t booked it yet.',
      'Weeks 2 and 3 are the best time, because by then there’s something to talk about. I read your plan, your progress and your session brief beforehand, so we start where you are.',
      'It takes a minute. In the app, go to Tools, then “Book your session”.'
    ],
    button: 'Book my session'
  },
  renew: {
    subject: 'Your four weeks are nearly up',
    paras: [
      'Your four weeks finish in {days_left} days. Well done for getting this far.',
      'If you’d like to keep going, another month is {price} and includes one more 60-minute session with me. Your plan, your notes and what Sky knows about you carry on exactly as they are.',
      'If you’d rather stop here, there’s nothing to do and nothing to cancel. Sky’s memory of you is kept for 30 days after your access ends, in case you change your mind, and you can download or delete it any time.',
      'And if you did the four weeks and don’t feel you’ve moved forward, hit reply and tell me. Your next month is on me.'
    ],
    button: 'Keep going for another month'
  },
  renewScholarship: {
    subject: 'Your four weeks are nearly up',
    paras: [
      'Your four weeks finish in {days_left} days. Well done for getting this far.',
      'If you’d like to carry on, reply and tell me how it’s going and what you’d want from another month. Continuing on a scholarship place is something we decide together.',
      'If you’d rather stop here, there’s nothing to do. Sky’s memory of you is kept for 30 days after your access ends, and you can download or delete it any time.'
    ],
    button: 'Open New Page'
  },
  quiet: {
    subject: 'Checking in',
    paras: [
      'I noticed you haven’t opened New Page for a few days. That’s okay. Life gets in the way.',
      'The smallest step is just opening it and ticking one thing off, or telling Sky what’s in the way.',
      'And if New Page isn’t working for you, hit reply and tell me. I read every reply.'
    ],
    button: 'Open New Page'
  }
}

export const RULES = { weekStart: { 2: 7, 3: 14, 4: 21 }, weekWindowDays: 4, bookFromDay: 9, bookToDay: 24, renewDaysLeft: 2, quietAfterDays: 5, quietFromDay: 3, quietToDay: 26, quietMax: 3, quietGapDays: 10, gapDays: 2 }

const when = v => (v ? new Date(v).getTime() : null)

// The one email (if any) to send this member today. At most one a day, never
// two within two days of each other, and a missed day never causes a backlog.
//   sent: rows of { kind, sent_at }
export function dueProgramEmail({ member, now = Date.now(), sent = [], sessionsRemaining = 0, hasUpcoming = false }) {
  if (member.status !== 'active' || member.program_emails === false) return null
  const until = when(member.access_until)
  if (until != null && until < now) return null
  const pos = programPosition(member.plan_started_at, now)
  const days = pos.day - 1
  const has = k => sent.some(s => s.kind === k)
  const last = Math.max(0, ...sent.map(s => when(s.sent_at) || 0))
  if (last && now - last < RULES.gapDays * DAY) return null
  const source = member.source

  if (until != null && !has('renew')) {
    const left = Math.ceil((until - now) / DAY)
    if (left <= RULES.renewDaysLeft && left >= 0) return { kind: source === 'scholarship' ? 'renewScholarship' : 'renew', key: 'renew', daysLeft: Math.max(1, left) }
  }
  if (member.quadrant) {
    for (const w of [4, 3, 2]) {
      const start = RULES.weekStart[w]
      if (days >= start && days < start + RULES.weekWindowDays && !has(`week-${w}`)) return { kind: 'week', key: `week-${w}`, week: w }
    }
  }
  if (days >= RULES.bookFromDay && days <= RULES.bookToDay && sessionsRemaining > 0 && !hasUpcoming && !has('book')) return { kind: 'book', key: 'book' }
  const lastLogin = when(member.last_login_at) || when(member.plan_started_at)
  if (days >= RULES.quietFromDay && days <= RULES.quietToDay && now - lastLogin >= RULES.quietAfterDays * DAY) {
    const q = sent.filter(s => s.kind === 'quiet' || String(s.key || '').startsWith('quiet-') || String(s.kind).startsWith('quiet-'))
    const lastQ = Math.max(0, ...q.map(s => when(s.sent_at) || 0))
    if (q.length < RULES.quietMax && (!lastQ || now - lastQ >= RULES.quietGapDays * DAY)) return { kind: 'quiet', key: `quiet-${q.length + 1}` }
  }
  return null
}

const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))

// Builds the email for something dueProgramEmail returned.
export function buildProgramEmail(due, { member, sessionsRemaining = 0, optOutUrl = null }) {
  const first = (member.name || '').split(' ')[0] || 'there'
  const vars = { first, price: `$${(PRICE.renewCents / 100).toLocaleString('en-AU')}`, sessions_left: String(sessionsRemaining), days_left: String(due.daysLeft ?? '') }
  if (due.kind === 'week') {
    const w = PROGRAM[member.quadrant]?.[due.week - 1]
    Object.assign(vars, { week: String(due.week), week_title: w?.title || '', week_goal: w?.goal || '', first_task: w?.tasks?.[0]?.text || '' })
  }
  const t = PROGRAM_MAILS[due.kind]
  const href = due.kind === 'book' ? `${APP_URL()}#tools/session` : due.kind === 'renew' ? `${APP_URL()}#today` : APP_URL()
  const subject = fill(t.subject, vars)
  const body = `<p style="${P}">Hi ${esc(first)},</p>` + t.paras.map(p => `<p style="${P}">${esc(fill(p, vars))}</p>`).join('') + button(href, t.button)
    + `<p style="${P}">Vik</p><p style="${P};font-size:13px;color:#56607A">If you’re asked to sign in, use the email these came to.</p>`
  return { subject, html: layout({ preheader: fill(t.paras[0], vars).slice(0, 110), body, unsubscribe: optOutUrl }) }
}

// A receipt after a payment. No tax wording: it only states what was paid and for what.
export function receiptEmail({ name, what, amountCents, date, ref, accessUntil }) {
  const first = (name || '').split(' ')[0] || 'there'
  const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#56607A">${esc(k)}</td><td style="padding:6px 0;text-align:right"><b>${esc(v)}</b></td></tr>`
  const body = `
    <p style="${P}">Hi ${esc(first)},</p>
    <p style="${P}">Thanks. Here’s your receipt.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #EDF1F7;border-bottom:1px solid #EDF1F7;margin:0 0 16px">
      ${row('For', what)}${row('Amount paid', `$${(amountCents / 100).toFixed(2)} AUD`)}${row('Date', fmt(date))}${accessUntil ? row('Access until', fmt(accessUntil)) : ''}${row('Reference', ref)}
    </table>
    <p style="${P}">Keep this email for your records. If anything looks wrong, reply and I’ll sort it out.</p>
    <p style="${P}">Vik</p>`
  return { subject: 'Your New Page receipt', html: layout({ preheader: `Receipt for ${what}`, body, unsubscribe: null }) }
}
