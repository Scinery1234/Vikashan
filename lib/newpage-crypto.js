// Encryption for what members tell Sky: their chats, the notes Sky keeps, their
// resume, their "about me" answers, their private notes and what they share.
//
// Envelope encryption, all AES-256-GCM:
//   - Each member gets their own random 256-bit data key. It is stored only
//     in wrapped form (encrypted with the master key).
//   - The master key is NEWPAGE_MEMORY_KEY (base64, 32 bytes), kept in Vercel
//     and never in the database. A copy of the database alone shows only
//     ciphertext. NEWPAGE_MEMORY_KEY_OLD can hold the previous master key
//     while rotating.
//   - Each value is bound to its member and field (authenticated data), so a
//     value can't be moved to another member or field.
//   - Deleting a member's wrapped data key makes everything encrypted with it
//     permanently unreadable, including in backups ("crypto-shredding"). That
//     is how a purge is made final.
//
// This protects data at rest and from anyone who can read the database. Sky
// itself has to read a member's text to answer, so this is not end-to-end
// encryption, and the privacy page should say so.
import crypto from 'node:crypto'

const PREFIX = 'enc1:'
const KEY_PREFIX = 'k1:'

function masterKeys() {
  const out = []
  for (const v of [process.env.NEWPAGE_MEMORY_KEY, process.env.NEWPAGE_MEMORY_KEY_OLD]) {
    if (!v) continue
    const b = Buffer.from(v.trim(), 'base64')
    if (b.length === 32) out.push(b)
  }
  return out
}
export const cryptoReady = () => masterKeys().length > 0

const seal = (key, plain, aad) => {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')
}
const open = (key, data, aad) => {
  const b = Buffer.from(data, 'base64url')
  if (b.length < 29) throw new Error('Bad ciphertext')
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
  d.setAAD(Buffer.from(aad))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()])
}

// A new data key for a member, wrapped with the current master key.
export function newWrappedKey(memberId) {
  const [master] = masterKeys()
  if (!master) throw new Error('NEWPAGE_MEMORY_KEY is not set')
  return KEY_PREFIX + seal(master, crypto.randomBytes(32), `dek:${memberId}`)
}

export function unwrapKey(wrapped, memberId) {
  if (!wrapped || !wrapped.startsWith(KEY_PREFIX)) throw new Error('No data key')
  for (const m of masterKeys()) {
    try { return open(m, wrapped.slice(KEY_PREFIX.length), `dek:${memberId}`) } catch { /* try the next key */ }
  }
  throw new Error('Could not unlock the data key')
}

// Re-wraps a data key with the current master key (used after a rotation).
export const rewrapKey = (wrapped, memberId) => KEY_PREFIX + seal(masterKeys()[0], unwrapKey(wrapped, memberId), `dek:${memberId}`)
export const needsRewrap = (wrapped, memberId) => {
  const [master] = masterKeys()
  if (!master || !wrapped) return false
  try { open(master, wrapped.slice(KEY_PREFIX.length), `dek:${memberId}`); return false } catch { return true }
}

export const isEncrypted = v => typeof v === 'string' && v.startsWith(PREFIX)

// A vault encrypts and decrypts for one member. Values written before
// encryption was switched on are plain text and are returned as they are.
export function makeVault(memberId, dataKey) {
  const ad = field => `${memberId}:${field}`
  return {
    memberId,
    text: (field, s) => PREFIX + seal(dataKey, Buffer.from(String(s ?? ''), 'utf8'), ad(field)),
    read: (field, s) => (isEncrypted(s) ? open(dataKey, s.slice(PREFIX.length), ad(field)).toString('utf8') : s),
    json: (field, o) => ({ enc: PREFIX + seal(dataKey, Buffer.from(JSON.stringify(o ?? null), 'utf8'), ad(field)) }),
    readJson: (field, v) => (v && typeof v === 'object' && isEncrypted(v.enc) ? JSON.parse(open(dataKey, v.enc.slice(PREFIX.length), ad(field)).toString('utf8')) : v)
  }
}

// What to show when something can't be decrypted (a lost key, say).
export const UNREADABLE = '[unreadable]'
