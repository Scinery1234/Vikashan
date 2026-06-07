import { Resend } from 'resend'
import { emailWrapper, fillTemplate } from './email-templates.js'
import { supabase } from './supabase.js'

const resend = new Resend(process.env.RESEND_API_KEY)

async function getSubject(key, fallback, vars = {}) {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .single()
  const raw = data?.value?.replace(/^"|"$/g, '') ?? fallback
  return fillTemplate(raw, vars)
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

function fmtTime(timeStr) {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm} AEST`
}

// Build an ICS calendar invite string
function buildICS({ summary, description, location, dateStr, startTime, durationMins, organizerName, organizerEmail }) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = startTime.split(':').map(Number)
  const pad = n => String(n).padStart(2, '0')
  const dtStart = `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`
  const endDate = new Date(y, mo - 1, d, h, mi + durationMins)
  const dtEnd = `${endDate.getFullYear()}${pad(endDate.getMonth()+1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`
  const uid = `${dtStart}-${Math.random().toString(36).slice(2)}@vikashan.org`

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vikashan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=Australia/Sydney:${dtStart}`,
    `DTEND;TZID=Australia/Sydney:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    `ORGANIZER;CN=${organizerName}:mailto:${organizerEmail}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
}

// Build a Google Calendar add link
function googleCalLink({ summary, description, location, dateStr, startTime, durationMins }) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = startTime.split(':').map(Number)
  const pad = n => String(n).padStart(2, '0')
  const dtStart = `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`
  const endDate = new Date(y, mo - 1, d, h, mi + durationMins)
  const dtEnd = `${endDate.getFullYear()}${pad(endDate.getMonth()+1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${dtStart}/${dtEnd}`,
    details: description,
    location,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function calendarLinks({ booking, meetLink }) {
  const summary = `${booking.session_type_name} with Vik — Vikashan`
  const description = `Join at: ${meetLink}\n\nNeed to reschedule? Reply to your confirmation email.`
  const params = { summary, description, location: meetLink, dateStr: booking.date, startTime: booking.start_time, durationMins: booking.duration_mins }
  return {
    googleUrl: googleCalLink(params),
    ics: buildICS({ ...params, organizerName: process.env.FROM_NAME, organizerEmail: process.env.FROM_EMAIL })
  }
}

export async function sendConfirmation({ booking, client, zoomLink, sessionsTotal = 1, paymentPlan = false, instalmentCents = 0, totalCents = 0, recurDates = null }) {
  const subject = await getSubject(
    'email_confirmation_subject',
    `Your session is confirmed ✓`,
    { date: fmtDate(booking.date), time: fmtTime(booking.start_time), client_name: client.name.split(' ')[0] }
  )

  const { googleUrl, ics } = calendarLinks({ booking, meetLink: zoomLink })

  const html = emailWrapper({
    heading: 'Your session is confirmed ✓',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">Hi <strong>${client.name}</strong>,<br>
      Your session is confirmed. Here are the details:</p>`,
    details: {
      'Session': booking.session_type_name,
      ...(recurDates && recurDates.length > 1 ? { 'Sessions': `${recurDates.length} sessions` } : sessionsTotal > 1 ? { 'Package': `${sessionsTotal} sessions` } : {}),
      [recurDates && recurDates.length > 1 ? 'First session' : 'Date']: fmtDate(booking.date),
      'Time': fmtTime(booking.start_time),
      'Duration': `${booking.duration_mins} minutes`,
      ...(recurDates && recurDates.length > 1 ? {
        'Schedule': recurDates.map((d, i) => `${i+1}. ${fmtDate(d)}`).join('<br>')
      } : {}),
      'Amount': booking.amount_cents === 0 ? 'No payment required'
        : paymentPlan ? `$${(instalmentCents/100).toFixed(0)} today, then 2 × $${(instalmentCents/100).toFixed(0)} monthly (total $${(totalCents/100).toFixed(0)})`
        : sessionsTotal > 1 ? `$${(booking.amount_cents/100).toFixed(0)} × ${sessionsTotal} = $${(booking.amount_cents*sessionsTotal/100).toFixed(0)}`
        : `$${(booking.amount_cents/100).toFixed(0)}`,
    },
    ctaText: 'Join your Google Meet session',
    ctaUrl: zoomLink,
    footer: `
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        <a href="${googleUrl}" style="display:inline-block;background:#f7f6f3;border:1px solid #e4e3df;border-radius:5px;padding:8px 14px;font-size:12px;color:#141414;text-decoration:none">📅 Add to Google Calendar</a>
        <a href="data:text/calendar;charset=utf8,${encodeURIComponent(ics)}" download="vikashan-session.ics" style="display:inline-block;background:#f7f6f3;border:1px solid #e4e3df;border-radius:5px;padding:8px 14px;font-size:12px;color:#141414;text-decoration:none">📅 Add to Outlook / Apple Calendar</a>
      </div>
      <p style="font-size:13px;color:#888;margin-top:12px">
        Need to reschedule or cancel? Reply to this email and Vik will sort it out.
      </p>`
  })

  // Also notify admin with calendar invite attached
  const adminIcs = buildICS({
    summary: `Session: ${client.name} — ${booking.session_type_name}`,
    description: `Client: ${client.name} (${client.email})\nMeet: ${zoomLink}`,
    location: zoomLink,
    dateStr: booking.date,
    startTime: booking.start_time,
    durationMins: booking.duration_mins,
    organizerName: process.env.FROM_NAME,
    organizerEmail: process.env.FROM_EMAIL
  })

  await Promise.all([
    resend.emails.send({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: client.email,
      subject,
      html
    }),
    resend.emails.send({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New booking: ${client.name} — ${fmtDate(booking.date)} ${fmtTime(booking.start_time)}`,
      html: emailWrapper({
        heading: `New booking: ${client.name}`,
        body: `<p style="color:#555;font-size:14px;line-height:1.7">A new session has been booked.</p>`,
        details: {
          'Client': `${client.name} (${client.email})`,
          'Session': booking.session_type_name,
          'Date': fmtDate(booking.date),
          'Time': fmtTime(booking.start_time),
          'Duration': `${booking.duration_mins} minutes`,
        },
        ctaText: 'View in admin panel',
        ctaUrl: `${process.env.NEXT_PUBLIC_URL}/vikashan_booking_admin.html`,
        footer: `<div style="margin-top:16px"><a href="data:text/calendar;charset=utf8,${encodeURIComponent(adminIcs)}" download="vikashan-session.ics" style="display:inline-block;background:#f7f6f3;border:1px solid #e4e3df;border-radius:5px;padding:8px 14px;font-size:12px;color:#141414;text-decoration:none">📅 Add to Outlook / Apple Calendar</a></div>`
      }),
      attachments: [{ filename: 'vikashan-session.ics', content: Buffer.from(adminIcs).toString('base64'), type: 'text/calendar' }]
    })
  ])
}

export async function sendReminder24h({ booking, client }) {
  const subject = await getSubject(
    'email_reminder24_subject',
    `Reminder: your session tomorrow at ${fmtTime(booking.start_time)}`,
    { date: fmtDate(booking.date), time: fmtTime(booking.start_time), client_name: client.name.split(' ')[0] }
  )

  const html = emailWrapper({
    heading: 'Your session is tomorrow',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      Hi <strong>${client.name}</strong>,<br>
      Just a reminder that your ${booking.session_type_name} is tomorrow at
      <strong>${fmtTime(booking.start_time)}</strong>.</p>`,
    details: {
      'Date': fmtDate(booking.date),
      'Time': fmtTime(booking.start_time),
      'Google Meet link': booking.meet_link
    },
    ctaText: 'Join your Google Meet session',
    ctaUrl: booking.meet_link
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendReminder1h({ booking, client }) {
  const subject = await getSubject(
    'email_reminder1_subject',
    `Your session starts in 1 hour`,
    { date: fmtDate(booking.date), time: fmtTime(booking.start_time), client_name: client.name.split(' ')[0] }
  )

  const html = emailWrapper({
    heading: 'Your session starts in 1 hour',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      Hi <strong>${client.name}</strong>,<br>
      Your ${booking.session_type_name} with Vik starts in one hour at
      <strong>${fmtTime(booking.start_time)}</strong>.</p>`,
    ctaText: 'Join now',
    ctaUrl: booking.meet_link
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendFollowUp({ booking, client }) {
  const subject = await getSubject(
    'email_followup_subject',
    `Good to see you — what's next`,
    { client_name: client.name.split(' ')[0] }
  )

  const html = emailWrapper({
    heading: `Good to see you, ${client.name.split(' ')[0]}`,
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      It was good to connect today. I hope the session was useful.<br><br>
      If anything came up after we spoke, or if you want to continue the conversation,
      reply to this email — I'm here.</p>`,
    ctaText: 'Book your next session',
    ctaUrl: `${process.env.NEXT_PUBLIC_URL}/#booking`
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendContactNotification({ name, email, service, message }) {
  const html = emailWrapper({
    heading: `New contact message from ${name}`,
    body: `
      <p style="color:#555;font-size:14px;line-height:1.7">
        <strong>From:</strong> ${name} &lt;${email}&gt;<br>
        <strong>Service interest:</strong> ${service || 'Not specified'}
      </p>
      <div style="background:#f7f6f3;border-radius:6px;padding:14px 16px;margin:12px 0;font-size:14px;color:#333;line-height:1.7;white-space:pre-wrap">${message}</div>`,
    ctaText: `Reply to ${name}`,
    ctaUrl: `mailto:${email}`
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: process.env.ADMIN_EMAIL,
    replyTo: email,
    subject: `New enquiry from ${name}`,
    html
  })
}

export async function sendPaymentPlanReceipt({ client, instalmentNum, instalmentTotal, amountCents, isComplete }) {
  const html = emailWrapper({
    heading: isComplete ? 'Your payment plan is complete ✓' : `Payment received — instalment ${instalmentNum} of ${instalmentTotal}`,
    body: `<p style="color:#555;font-size:14px;line-height:1.7">
      Hi <strong>${client.name}</strong>,<br>
      ${isComplete
        ? 'Your payment plan is now fully paid. Thank you — your sessions are confirmed.'
        : `Instalment ${instalmentNum} of ${instalmentTotal} has been charged successfully. ${instalmentTotal - instalmentNum} payment${instalmentTotal - instalmentNum === 1 ? '' : 's'} remaining.`
      }</p>`,
    details: {
      'Amount charged': `$${(amountCents / 100).toFixed(0)}`,
      'Instalment': `${instalmentNum} of ${instalmentTotal}`,
      'Status': isComplete ? 'Fully paid ✓' : 'On track'
    },
    footer: `<p style="font-size:13px;color:#888;margin-top:12px">Questions about your payment plan? Reply to this email.</p>`
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject: isComplete ? 'Your Vikashan payment plan is complete ✓' : `Payment received — instalment ${instalmentNum} of ${instalmentTotal}`,
    html
  })
}
