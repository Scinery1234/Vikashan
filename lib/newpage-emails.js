// New Page quiz emails: the plan email (sent straight away) and the 6-week
// follow-up series (sent by api/newpage/followups.js). Signed by Vik.
import { QUADRANTS, planTweaks, BLOCKERS, BLOCKER_TIPS } from '../newpage/quiz-logic.js'

const BASE = () => process.env.NEXT_PUBLIC_URL || 'https://vikashan.com.au'
export const QUIZ_URL = () => `${BASE()}/newpage`
export const SCHOLARSHIP_URL = () => `${BASE()}/newpage#scholarship`
export const CALL_URL = () => `${BASE()}/#book-call`
export const unsubscribeUrl = token => `${BASE()}/api/newpage/unsubscribe?t=${encodeURIComponent(token)}`

// Days after the quiz on which follow-ups go out.
export const FOLLOWUP_DAYS = [2, 5, 7, 14, 21, 28, 35, 42]

// The follow-up due for a lead `days` days after the quiz: the latest
// scheduled day already reached that hasn't been sent yet. A missed cron run
// sends only the most recent email, never a backlog.
export function dueDay(days, lastSent) {
  const due = FOLLOWUP_DAYS.filter(d => d <= days && d > (lastSent || 0))
  return due.length ? due[due.length - 1] : null
}

// Real client stories (with permission) for the day-21 email, by quadrant.
// Day 21 is skipped for any quadrant without a story.
export const CLIENT_STORIES = {}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const P = 'margin:0 0 14px;font-size:16px;line-height:1.6;color:#15203B'

function layout({ preheader, body, unsubscribe }) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New Page</title></head>
<body style="margin:0;padding:0;background:#F5F7FB">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FB"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border:1px solid #DCE3EE;border-radius:14px;font-family:Figtree,Helvetica,Arial,sans-serif;color:#15203B">
<tr><td style="padding:22px 28px 6px;border-bottom:1px solid #EDF1F7">
<span style="font-family:'Familjen Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.3px">new page</span>
<span style="font-size:12px;color:#56607A;letter-spacing:1px;text-transform:uppercase;margin-left:8px">by Vikashan</span>
</td></tr>
<tr><td style="padding:24px 28px 8px">${body}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #EDF1F7;font-size:12px;line-height:1.6;color:#56607A">
Coaching, not therapy. In crisis? Call Lifeline on 13 11 14, any time.<br>
Vikashan · Career coaching · Online${unsubscribe ? ` · <a href="${unsubscribe}" style="color:#56607A">Unsubscribe</a>` : ''}
</td></tr></table></td></tr></table></body></html>`
}

const hl = (text, color) => `<span style="background:linear-gradient(transparent 55%,${color} 55%,${color} 92%,transparent 92%)">${esc(text)}</span>`
const button = (href, label) => `<a href="${href}" style="display:inline-block;background:#15203B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:12px;margin:6px 0 16px">${esc(label)}</a>`

function planHtml(quadrant, tweaks, showNotes = true) {
  const Q = QUADRANTS[quadrant]
  const weeks = Q.weeks.map((w, i) => `
    <p style="margin:20px 0 4px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#56607A">Week ${i + 1} · ${esc(w.title)}</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5;font-style:italic;color:#56607A">${esc(w.why)}</p>
    <ul style="margin:0 0 8px;padding-left:20px">${w.steps.map(s => `<li style="font-size:15px;line-height:1.55;margin:0 0 6px">${esc(s)}</li>`).join('')}</ul>
    ${showNotes ? `<p style="margin:0 0 6px;padding:8px 12px;font-size:13px;line-height:1.5;color:#56607A;background:#FFFFFF;border:1px solid #DCE3EE;border-radius:8px"><b style="color:#15203B">Optional, with New Page:</b> ${esc(w.withNewPage)}</p>` : ''}`).join('')
  const extra = tweaks.length
    ? `<p style="margin:18px 0 6px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#56607A">Just for you</p>
       <ul style="margin:0;padding-left:20px">${tweaks.map(t => `<li style="font-size:15px;line-height:1.55;margin:0 0 6px">${esc(t)}</li>`).join('')}</ul>`
    : ''
  return `<div style="background:#F5F7FB;border-radius:12px;padding:6px 18px 14px;margin:0 0 18px">${weeks}${extra}</div>`
}

export function planEmail({ name, quadrant, answers, personal, introCall, token, struggling = false }) {
  const Q = QUADRANTS[quadrant]
  const first = esc((name || '').split(' ')[0]) || 'there'
  const tweaks = planTweaks(answers, personal)
  // Anyone who said they're really struggling gets support, not a sales line.
  const ps = struggling
    ? `<p style="${P};font-style:italic">P.S. Go easy on yourself with this plan. If things get heavier, Lifeline is there on 13 11 14, any time.</p>`
    : introCall
      ? `<p style="${P};font-style:italic">P.S. You mentioned you’d like some support. You can book a free 20-minute call with me here: <a href="${CALL_URL()}">book a call</a>.</p>`
      : `<p style="${P};font-style:italic">P.S. If you’d like a coach in your corner for these four weeks, that’s what New Page is for: <a href="${QUIZ_URL()}">find out more</a>.</p>`
  const body = `
    <p style="${P}">Hi ${first},</p>
    <p style="${P}">Thanks for taking the quiz. You’re in <b>${hl(Q.name, Q.color)}</b>: ${esc(Q.oneLine)}.</p>
    <p style="${P}">Your full 4-week plan is below, and there’s a calendar invite attached for your week-one step. Everything in it works on its own, with nothing to buy. You don’t need to do it perfectly. Just start with week one.</p>${struggling ? '' : `<p style="${P}">Under each week, you’ll see a short note about how New Page can help. They’re optional extras. The plan is yours either way.</p>`}
    ${planHtml(quadrant, tweaks, !struggling)}
    <p style="${P}">I’ll check in over the next few weeks to see how it’s going.</p>
    <p style="${P}">Vik</p>
    ${ps}`
  return {
    subject: `Your New Page plan: ${Q.name}`,
    html: layout({ preheader: `Your 4-week ${Q.name} plan, starting with one small step.`, body, unsubscribe: token ? unsubscribeUrl(token) : null }),
    ics: weekOneICS(Q)
  }
}

// A 30-minute slot at 9am tomorrow (Sydney time) for the week-one step.
export function weekOneICS(Q, now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now.getTime() + 24 * 60 * 60 * 1000)).replace(/-/g, '')
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const fold = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vikashan//New Page//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${stamp}-${Math.random().toString(36).slice(2)}@vikashan.com.au`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Australia/Sydney:${ymd}T090000`,
    `DTEND;TZID=Australia/Sydney:${ymd}T093000`,
    `SUMMARY:${fold(`New Page: your first ${Q.name} step`)}`,
    `DESCRIPTION:${fold(Q.week1)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'DESCRIPTION:Your New Page step', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n')
}

// ── Follow-ups ─────────────────────────────────────────────────
// Each entry: [subject, paragraphs]. {retake}, {call}, {scholarship} and
// {stay} are replaced with links.
const BY_QUADRANT = {
  recharge: {
    2: ['Rest counts', ['A quick reminder that your only job this week is your daily reset. If you’ve missed a day, just pick it up again today.', 'Rest isn’t a detour from your career. It’s what makes the next step possible.']],
    5: ['The thing that weighs most', ['Most people in Recharge are carrying one worry that takes up more room than it should. Next week’s step is putting it down for a while.', 'If you want help with that, the Reducing the Charge coach in New Page is built for exactly this.']],
    7: ['How was week one?', ['One week in. Did your reset stick, even a little?', 'Hit reply and tell me in one line. I read every reply.']],
    14: ['Where are you at now?', ['Two weeks on, it’s worth retaking the quiz. It takes 3 minutes and you might be surprised where your dot has moved: {retake}.', 'If you’d like support for the rest of the way, New Page includes a 1:1 session with me.']]
  },
  explore: {
    2: ['Your top five', ['Have you written your five values yet? If not, here’s a shortcut: think of a time work felt really good. What was true about it?', 'That’s where your values are hiding.']],
    5: ['Wild ideas welcome', ['Next week is about generating career ideas, and the strange ones are often the most useful.', 'In New Page, The Compass mixes what you know, do and love into ideas you might not have thought of.']],
    7: ['What surprised you?', ['A week of Explore done. What surprised you about what matters to you?', 'Reply with one line. I’d love to hear it.']],
    14: ['Time to test it', ['Ideas are only half of it. Week 3 is about real-world experiments: one coffee chat, one taster, one close read of job ads.', 'Retake the quiz to see if you’ve moved: {retake}. If you’d like help choosing, New Page includes a session with me.']]
  },
  unstick: {
    2: ['15 minutes', ['Have you done your 15-minute task? If not, shrink it again. “Open the document” counts.', 'Starting is the hardest part. Everything after is easier.']],
    5: ['It’s not laziness', ['When you know what to do but can’t start, there’s usually something underneath: fear of getting it wrong, too many steps, low energy.', 'The Action Coach in New Page helps you find what it is, without judgement.']],
    7: ['Did you start?', ['One week in. Did the 15-minute task happen? Either answer is fine.', 'Reply and tell me what got in the way, or what helped.']],
    14: ['Small steps add up', ['Two weeks of small steps is more than most people manage. Retake the quiz and see if your dot has moved: {retake}.', 'If you’d like someone in your corner for the next two weeks, New Page includes a 1:1 session with me.']]
  },
  launch: {
    2: ['The three-ad trick', ['Did you find your three job ads? The words that appear in all three are what screeners look for.', 'Your resume should use them, honestly and specifically.']],
    5: ['Five good applications beat fifty', ['Next week is about building a pipeline. Tailored applications get far more replies than mass ones.', 'New Page’s resume and cover letter writers tailor each one to the ad in minutes.']],
    7: ['How’s the resume?', ['A week into Launch. Is your resume ready?', 'Reply with where you’re up to and what’s tripping you up.']],
    14: ['Ready for interviews?', ['If your applications are out, interviews are next. Retake the quiz to see where you’re at: {retake}.', 'New Page includes a 1:1 session with me, which many people use for interview preparation.']]
  }
}

const SHARED = {
  28: ['Four weeks on', ['It’s been four weeks since you took the quiz. However far you got with the plan, it’s worth seeing where you are now. Retake it here: {retake}.', 'If you’ve moved, I’d love to hear about it. If you haven’t, that’s useful to know too, and it might be a sign that some support would help. New Page includes a 1:1 session with me.']],
  35: ['If cost is what’s stopping you', ['New Page is $500, and I know that’s a real amount. A few things that might help: you can spread the cost with a payment plan; if you change your mind within 7 days, you get a full refund; and if you do the four weeks and don’t move forward, your next month is free. Each month Purposefields also funds five full scholarships for people who couldn’t otherwise afford it: {scholarship}.', 'And if you’d like to talk it through first, book a free 20-minute call: {call}.']],
  42: ['Should I keep in touch?', ['This is the last email in this series. If you’d like to keep hearing from me now and then, with occasional tips and new resources, just click here: {stay}.', 'Otherwise, no action needed and I’ll stop here. Whatever page you’re on, I hope the next one is a good one.']]
}

// Day 2 adds a tip for whatever they said is most in the way, if they told us.
function blockerLine(day, personal) {
  const tip = day === 2 && BLOCKER_TIPS[personal?.block]
  if (!tip) return ''
  const label = BLOCKERS.find(b => b.v === personal.block).l.toLowerCase()
  return `<p style="${P}">You said ${esc(label)} is most in the way right now. ${esc(tip)}</p>`
}

export function followupEmail({ day, quadrant, name, token, stayUrl, personal = {} }) {
  let entry
  if (day === 21) {
    const story = CLIENT_STORIES[quadrant]
    if (!story) return null
    entry = [story.subject, story.paragraphs]
  } else {
    entry = BY_QUADRANT[quadrant]?.[day] || SHARED[day]
  }
  if (!entry) return null
  const [subject, paras] = entry
  const links = {
    retake: `<a href="${QUIZ_URL()}">retake the quiz</a>`,
    call: `<a href="${CALL_URL()}">book a call</a>`,
    scholarship: `<a href="${SCHOLARSHIP_URL()}">apply for a scholarship</a>`,
    stay: `<a href="${stayUrl || QUIZ_URL()}">yes, keep in touch</a>`
  }
  const first = esc((name || '').split(' ')[0]) || 'there'
  const body = `<p style="${P}">Hi ${first},</p>` +
    paras.map(p => `<p style="${P}">${esc(p).replace(/\{(retake|call|scholarship|stay)\}/g, (_, k) => links[k])}</p>`).join('') +
    blockerLine(day, personal) +
    `<p style="${P}">Vik</p>`
  const words = { retake: 'retake the quiz', call: 'book a call', scholarship: 'apply for a scholarship', stay: 'keep in touch' }
  const preheader = paras[0].replace(/\{(retake|call|scholarship|stay)\}/g, (_, k) => words[k])
  return { subject, html: layout({ preheader, body, unsubscribe: unsubscribeUrl(token) }) }
}

// One email to everyone who asked to hear when New Page opens. Sent from
// the admin page (newpage/admin), which calls api/newpage/launch.
export function launchEmail({ name, checkoutUrl, token }) {
  const first = esc((name || '').split(' ')[0]) || 'there'
  const url = checkoutUrl || `${BASE()}/newpage/program`
  const body = `
    <p style="${P}">Hi ${first},</p>
    <p style="${P}">You asked me to let you know when New Page opens. ${hl('It’s open now.', '#D4F36B')}</p>
    <p style="${P}">New Page is four weeks of focused support: your plan loaded into a planner with reminders, coaches for when you’re stuck, low on energy or deciding, career tools, and a 60-minute 1:1 session with me.</p>
    <p style="${P}">It’s $500 for the four weeks. If you change your mind within 7 days, you get a full refund. If you do the four weeks and don’t move forward, your next month is free.</p>
    ${button(url, 'Start New Page')}
    <p style="${P}">Places are limited each month, because I run every 1:1 session myself. If cost is the barrier, you can <a href="${SCHOLARSHIP_URL()}">apply for a scholarship</a>.</p>
    <p style="${P}">Vik</p>`
  return {
    subject: 'New Page is open',
    html: layout({ preheader: 'You asked me to let you know. New Page is open now.', body, unsubscribe: token ? unsubscribeUrl(token) : null })
  }
}

// ── Member app emails ──────────────────────────────────────────
export const APP_URL = () => `${BASE()}/newpage/app`

export function memberLoginEmail({ name, link }) {
  const first = esc((name || '').split(' ')[0]) || 'there'
  const body = `
    <p style="${P}">Hi ${first},</p>
    <p style="${P}">Here’s your link to sign in to New Page. It works for 15 minutes.</p>
    ${button(link, 'Sign in to New Page')}
    <p style="${P};font-size:14px;color:#56607A">If the button doesn’t work, copy this address into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>
    <p style="${P};font-size:14px;color:#56607A">Didn’t ask for this? You can ignore this email. Nothing happens unless the link is opened.</p>`
  return { subject: 'Your New Page sign-in link', html: layout({ preheader: 'Your link to sign in to New Page.', body, unsubscribe: null }) }
}

export function memberWelcomeEmail({ name }) {
  const first = esc((name || '').split(' ')[0]) || 'there'
  const body = `
    <p style="${P}">Hi ${first},</p>
    <p style="${P}">Welcome to ${hl('New Page', '#D4F36B')}. Your four weeks are ready.</p>
    <p style="${P}">Inside you’ll find your plan, week by week, with a tick-off list; a Career Coach and five specialist coaches you can talk things through with any time; a planner for your tasks and goals; the Compass for working out your direction; a resume and cover letter writer; and a check-in to see how far you’ve moved. Your 1:1 session with me is best booked for week 2 or 3.</p>
    ${button(APP_URL(), 'Open New Page')}
    <p style="${P}">To sign in, enter your email on that page and we’ll send you a link. There’s no password to remember.</p>
    <p style="${P}">Vik</p>`
  return { subject: 'Welcome to New Page', html: layout({ preheader: 'Your four weeks are ready.', body, unsubscribe: null }) }
}

// Morning reminder: what's on the member's planner today.
export function reminderEmail({ name, items }) {
  const first = esc((name || '').split(' ')[0]) || 'there'
  const row = t => `<li style="margin:0 0 6px">${t.start ? `<b>${esc(t.start)}</b> ` : ''}${esc(t.title)}${t.overdue ? ' <span style="color:#56607A">(from earlier)</span>' : ''}</li>`
  const body = `
    <p style="${P}">Morning ${first}. Here’s what’s on your New Page planner today:</p>
    <ul style="${P};padding-left:20px">${items.map(row).join('')}</ul>
    ${button(`${APP_URL()}#tools`, 'Open your planner')}
    <p style="${P};font-size:14px;color:#56607A">Don’t want these? Turn reminders off in the planner. They only go to you.</p>`
  return { subject: items.length === 1 ? '1 thing on your New Page list today' : `${items.length} things on your New Page list today`, html: layout({ preheader: items[0].title, body, unsubscribe: null }) }
}
