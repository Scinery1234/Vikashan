import { signToken } from '../../lib/auth.js'
import { checkLockout, recordFailedLogin, clearLoginAttempts } from '../../lib/security.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'

  if (checkLockout(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
  }

  const { password } = req.body

  if (!password) {
    return res.status(400).json({ error: 'Password required' })
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    recordFailedLogin(ip)
    return res.status(401).json({ error: 'Invalid password' })
  }

  clearLoginAttempts(ip)
  const token = signToken({ role: 'admin' })
  res.json({ token })
}
