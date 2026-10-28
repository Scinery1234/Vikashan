// Career Reading API (reading.vikashan.org). One function, chosen by ?op=:
//   GET  config                price and whether payments are on
//   GET  places&q=             birth-place search (111,000 places)
//   POST cast                  cast and seal the draw; returns the reading id
//   POST submit&id=            answers, birth details, question, email
//   GET  status&id=            progress, and the report when it's done
//   POST checkout&id=          a fresh Stripe checkout link
//   POST retry&id=             try a failed reading again
//   GET  report&id=            the report as a Markdown download
//   POST work&id=   (internal) write one batch of the reading
//   GET  (cron)                sweep: restart readings that are queued or stalled
import { rateLimit } from '../lib/security.js'
import { readingService, baseOf } from '../lib/reading/index.js'
import { ReadingError } from '../lib/reading/service.js'
import { searchPlaces } from '../lib/reading/astro.js'

const internal = req => !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
// Time for one batch of writing. Keep below this function's maxDuration in vercel.json.
const BUDGET_MS = (Number(process.env.READING_WORK_SECONDS) || 240) * 1000

export default async function handler(req, res, service = null) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const op = String(req.query.op || '')
  const id = String(req.query.id || '')
  const svc = service || readingService(baseOf(req))
  const POST = req.method === 'POST'
  try {
    if (!op && req.method === 'GET' && internal(req)) return res.json({ swept: await svc.sweep() })

    if (op === 'work' && POST) {
      if (!internal(req)) return res.status(401).json({ error: 'Unauthorized' })
      const result = await svc.work(id, { budgetMs: BUDGET_MS })
      if (result === 'more') await svc.kick(id)
      return res.json({ result })
    }
    if (op === 'config') return res.json({ price: svc.free ? null : svc.price(), free: svc.free })
    if (op === 'places') {
      if (!rateLimit(req, res, { max: 300, windowMs: 10 * 60 * 1000, key: 'reading-places' })) return
      const q = String(req.query.q || '').trim()
      return res.json(q.length < 2 ? [] : searchPlaces(q))
    }
    if (op === 'status') {
      if (!rateLimit(req, res, { max: 400, windowMs: 10 * 60 * 1000, key: 'reading-status' })) return
      res.setHeader('Cache-Control', 'private, no-store')
      return res.json(await svc.status(id))
    }
    if (op === 'report') {
      const md = await svc.report(id)
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="career-reading.md"')
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).send(md)
    }
    if (!POST) return res.status(405).json({ error: 'Method not allowed' })
    if (!rateLimit(req, res, { max: 20, windowMs: 10 * 60 * 1000, key: 'reading-' + op })) return
    if (op === 'cast') return res.json(await svc.cast())
    if (op === 'submit') return res.json(await svc.submit(id, req.body || {}))
    if (op === 'checkout') return res.json({ url: await svc.checkout(id) })
    if (op === 'retry') return res.json(await svc.retry(id))
    return res.status(404).json({ error: 'not_found' })
  } catch (err) {
    if (err instanceof ReadingError) return res.status(err.status).json({ error: err.code })
    console.error('Career Reading error:', err)
    return res.status(500).json({ error: 'internal' })
  }
}
