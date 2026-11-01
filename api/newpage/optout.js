import { supabase } from '../../lib/supabase.js'
import { readToken } from '../../lib/newpage-auth.js'

// One-click link in program emails. ?t=<token> stops them; add &on=1 to turn them back on.
// Receipts, booking emails and sign-in links are not affected.
export default async function handler(req, res) {
  const p = typeof req.query.t === 'string' ? readToken(req.query.t, 'optout') : null
  if (!p) return page(res, 400, 'That link has expired', 'Reply to any email from Vik and he’ll sort it out.')
  const on = req.query.on === '1'
  await supabase.from('newpage_members').update({ program_emails: on }).eq('id', p.sub)
  return on
    ? page(res, 200, 'Program emails are back on', 'You’ll get Vik’s nudges during your four weeks again.')
    : page(res, 200, 'No more program emails', 'You won’t get Vik’s weekly nudges or check-ins any more. Receipts, booking emails and sign-in links still come, and you can turn these back on in the app (Tools, then Planner).', `/api/newpage/optout?t=${encodeURIComponent(req.query.t)}&on=1`)
}

function page(res, status, title, text, undo) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Figtree,Helvetica,Arial,sans-serif;background:#F5F7FB;color:#15203B;margin:0"><main style="max-width:520px;margin:12vh auto;padding:0 20px"><h1 style="font-size:26px">${title}</h1><p style="font-size:17px;line-height:1.6">${text}</p>${undo ? `<p><a href="${undo}">Turn them back on</a></p>` : ''}<p><a href="/newpage/app">Open New Page</a></p></main></body></html>`)
}
