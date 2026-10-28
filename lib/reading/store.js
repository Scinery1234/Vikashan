// Where Career Readings are kept: the career_readings table (sql/reading.sql),
// or an in-memory store for tests.
import { randomUUID } from 'node:crypto'

export function supabaseStore(sb) {
  const must = ({ data, error }) => { if (error) throw error; return data }
  return {
    async create(row) {
      return must(await sb.from('career_readings').insert(row).select('*').single())
    },
    async get(id) {
      const rows = must(await sb.from('career_readings').select('*').eq('id', id).limit(1))
      return rows[0] || null
    },
    // Updates a reading; with `ifStatus`, only while it's still in that status. Returns the row, or null.
    async update(id, fields, ifStatus) {
      let q = sb.from('career_readings').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (ifStatus) q = q.in('status', [].concat(ifStatus))
      const rows = must(await q.select('*'))
      return rows[0] || null
    },
    // Takes the reading for one batch of writing, unless another batch holds it.
    async claim(id, leaseMs) {
      const now = new Date().toISOString()
      const rows = must(await sb.from('career_readings')
        .update({ status: 'running', lease_until: new Date(Date.now() + leaseMs).toISOString(), updated_at: now })
        .eq('id', id).in('status', ['queued', 'running'])
        .or(`lease_until.is.null,lease_until.lt.${now}`)
        .select('*'))
      return rows[0] || null
    },
    // Readings waiting to be written, or whose last batch stopped without finishing.
    async stalled(limit = 10) {
      const now = new Date().toISOString()
      return must(await sb.from('career_readings').select('id')
        .or(`status.eq.queued,and(status.eq.running,lease_until.is.null),and(status.eq.running,lease_until.lt.${now})`)
        .order('updated_at', { ascending: true }).limit(limit)).map(r => r.id)
    },
    async cleanup(before) {
      must(await sb.from('career_readings').delete().lt('created_at', before))
    }
  }
}

export function memoryStore() {
  const rows = new Map()
  const copy = r => (r ? structuredClone(r) : null)
  const leaseFree = r => !r.lease_until || r.lease_until < new Date().toISOString()
  return {
    rows,
    async create(row) {
      const now = new Date().toISOString()
      const r = {
        status: 'cast', asked_at: null, email: null, input: null, outputs: null, progress: null, report: null,
        error: null, paid: false, preview: false, stripe_session: null, lease_until: null,
        ...row, id: randomUUID(), created_at: now, updated_at: now
      }
      rows.set(r.id, r)
      return copy(r)
    },
    async get(id) { return copy(rows.get(id)) },
    async update(id, fields, ifStatus) {
      const r = rows.get(id)
      if (!r || (ifStatus && ![].concat(ifStatus).includes(r.status))) return null
      Object.assign(r, structuredClone(fields), { updated_at: new Date().toISOString() })
      return copy(r)
    },
    async claim(id, leaseMs) {
      const r = rows.get(id)
      if (!r || !['queued', 'running'].includes(r.status) || !leaseFree(r)) return null
      Object.assign(r, { status: 'running', lease_until: new Date(Date.now() + leaseMs).toISOString(), updated_at: new Date().toISOString() })
      return copy(r)
    },
    async stalled(limit = 10) {
      return [...rows.values()].filter(r => r.status === 'queued' || (r.status === 'running' && leaseFree(r))).slice(0, limit).map(r => r.id)
    },
    async cleanup(before) { for (const [id, r] of rows) if (r.created_at < before) rows.delete(id) }
  }
}
