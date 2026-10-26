import { supabase } from '../../lib/supabase.js'

// One-click links from New Page emails.
//   ?t=<token>          stop all New Page follow-ups for this email
//   ?t=<token>&stay=1   keep hearing from Vik after the series ends
export default async function handler(req, res) {
  const token = typeof req.query.t === 'string' ? req.query.t : ''
  const stay = req.query.stay === '1'
  if (!/^[a-f0-9]{32}$/.test(token)) return page(res, 400, 'That link doesn’t look right', 'Reply to any of our emails and we’ll sort it out.')

  // Tokens come from quiz leads or from the program page's waitlist.
  let { data: lead } = await supabase.from('newpage_leads').select('email').eq('unsubscribe_token', token).maybeSingle()
  if (!lead) ({ data: lead } = await supabase.from('newpage_waitlist').select('email').eq('unsubscribe_token', token).maybeSingle())
  if (!lead) return page(res, 404, 'That link has expired', 'Reply to any of our emails and we’ll sort it out.')

  const now = new Date().toISOString()
  if (stay) {
    await supabase.from('newpage_leads').update({ stay_subscribed: true }).eq('email', lead.email)
    return page(res, 200, 'Thanks, you’re staying in touch', 'You’ll hear from Vik now and then. You can unsubscribe from any email.')
  }
  await supabase.from('newpage_leads').update({ unsubscribed_at: now, opt_in: false }).eq('email', lead.email)
  await supabase.from('newpage_waitlist').update({ unsubscribed_at: now }).eq('email', lead.email)
  await supabase.from('subscribers').update({ unsubscribed_at: now }).eq('email', lead.email)
  await supabase.from('clients').update({ mailing_opt_in: false, updated_at: now }).eq('email', lead.email)
  return page(res, 200, 'You’re unsubscribed', 'You won’t get any more emails from New Page. Your plan is still yours to keep.')
}

function page(res, status, title, text) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:Figtree,Helvetica,Arial,sans-serif;color:#15203B;background:#FFFFFF">
<main style="max-width:520px;margin:0 auto;padding:64px 24px">
<p style="font-weight:700;font-size:20px;margin:0 0 32px">new page</p>
<h1 style="font-size:30px;line-height:1.15;margin:0 0 12px">${title}</h1>
<p style="font-size:17px;line-height:1.5;margin:0 0 24px">${text}</p>
<p><a href="/newpage" style="color:#1F4FD8">Back to New Page</a></p>
</main></body></html>`)
}
