import { Resend } from 'resend'
import { emailWrapper } from './email-templates.js'
import { supabase } from './supabase.js'

const resend = new Resend(process.env.RESEND_API_KEY)

async function getSubject(key, fallback) {
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value?.replace(/^"|"$/g, '') ?? fallback
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

export async function sendConfirmation({ booking, client, zoomLink }) {
  const subject = await getSubject(
    'email_confirmation_subject',
    `Your session is confirmed ✓`
  )

  const html = emailWrapper({
    heading: 'Your session is confirmed ✓',
    body: `<p style="color:#555;font-size:14px;line-height:1.7">Hi <strong>${client.name}</strong>,<br>
      Your session is confirmed. Here are the details:</p>`,
    details: {
      'Session': booking.session_type_name,
      'Date': fmtDate(booking.date),
      'Time': fmtTime(booking.start_time),
      'Duration': `${booking.duration_mins} minutes`,
      'Amount': booking.amount_cents === 0 ? 'Free' : `$${(booking.amount_cents / 100).toFixed(0)}`,
    },
    ctaText: 'Join your Google Meet session',
    ctaUrl: zoomLink,
    footer: `<p style="font-size:13px;color:#888;margin-top:12px">
      Need to reschedule or cancel? Reply to this email and Vik will sort it out.
    </p>`
  })

  return resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: client.email,
    subject,
    html
  })
}

export async function sendReminder24h({ booking, client }) {
  const subject = await getSubject(
    'email_reminder24_subject',
    `Reminder: your session tomorrow at ${fmtTime(booking.start_time)}`
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
    `Your session starts in 1 hour`
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
    `Good to see you — what's next`
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
