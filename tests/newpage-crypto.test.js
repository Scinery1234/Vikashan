import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { cryptoReady, newWrappedKey, unwrapKey, makeVault, isEncrypted, needsRewrap, rewrapKey } from '../lib/newpage-crypto.js'

const k = () => crypto.randomBytes(32).toString('base64')
const M1 = '11111111-1111-1111-1111-111111111111', M2 = '22222222-2222-2222-2222-222222222222'

test('nothing is encrypted until a master key is set', () => {
  delete process.env.NEWPAGE_MEMORY_KEY; delete process.env.NEWPAGE_MEMORY_KEY_OLD
  assert.equal(cryptoReady(), false)
  assert.throws(() => newWrappedKey(M1), /NEWPAGE_MEMORY_KEY/)
  process.env.NEWPAGE_MEMORY_KEY = 'tooshort'
  assert.equal(cryptoReady(), false, 'a key of the wrong size is ignored')
})

test('round trip, random every time, and not readable without the key', () => {
  process.env.NEWPAGE_MEMORY_KEY = k()
  assert.equal(cryptoReady(), true)
  const wrapped = newWrappedKey(M1)
  const v = makeVault(M1, unwrapKey(wrapped, M1))
  const a = v.text('msg', 'I am an INFJ and I hate cold calling'), b = v.text('msg', 'I am an INFJ and I hate cold calling')
  assert.ok(isEncrypted(a) && a !== b, 'same text encrypts differently each time')
  assert.ok(!a.includes('INFJ'))
  assert.equal(v.read('msg', a), 'I am an INFJ and I hate cold calling')
  assert.deepEqual(v.readJson('about', v.json('about', { mbti: 'INFJ', n: [1, 2] })), { mbti: 'INFJ', n: [1, 2] })
  assert.equal(v.text('x', 'é 日本語 🎯').length > 10 && v.read('x', v.text('x', 'é 日本語 🎯')), 'é 日本語 🎯')
})

test('values are bound to their member and field, and tampering is caught', () => {
  process.env.NEWPAGE_MEMORY_KEY = k()
  const key = unwrapKey(newWrappedKey(M1), M1)
  const v1 = makeVault(M1, key), v2 = makeVault(M2, key) // even with the same key, another member's id differs
  const c = v1.text('msg', 'secret')
  assert.throws(() => v1.read('mem', c), 'another field cannot read it')
  assert.throws(() => v2.read('msg', c), 'another member cannot read it')
  const flipped = c.slice(0, -2) + (c.endsWith('A') ? 'B' : 'A') + c.slice(-1)
  assert.throws(() => v1.read('msg', flipped), 'a changed byte is refused')
  const other = makeVault(M1, unwrapKey(newWrappedKey(M1), M1))
  assert.throws(() => other.read('msg', c), 'a different data key cannot read it')
})

test('old plain text still reads, so switching encryption on loses nothing', () => {
  process.env.NEWPAGE_MEMORY_KEY = k()
  const v = makeVault(M1, unwrapKey(newWrappedKey(M1), M1))
  assert.equal(v.read('msg', 'hello from before'), 'hello from before')
  assert.deepEqual(v.readJson('about', { text: 'old plain json' }), { text: 'old plain json' })
})

test('a data key only unwraps with the right master key and member, and master keys can be rotated', () => {
  const oldKey = k(), newKey = k()
  process.env.NEWPAGE_MEMORY_KEY = oldKey; delete process.env.NEWPAGE_MEMORY_KEY_OLD
  const wrapped = newWrappedKey(M1)
  const dek = unwrapKey(wrapped, M1)
  assert.throws(() => unwrapKey(wrapped, M2), 'bound to the member')
  process.env.NEWPAGE_MEMORY_KEY = newKey
  assert.throws(() => unwrapKey(wrapped, M1), 'a new master key alone cannot open old keys')
  process.env.NEWPAGE_MEMORY_KEY_OLD = oldKey
  assert.deepEqual(unwrapKey(wrapped, M1), dek, 'while the old key is kept, nothing is lost')
  assert.equal(needsRewrap(wrapped, M1), true)
  const re = rewrapKey(wrapped, M1)
  delete process.env.NEWPAGE_MEMORY_KEY_OLD
  assert.deepEqual(unwrapKey(re, M1), dek, 'after re-wrapping, the old master key can be retired')
  assert.equal(needsRewrap(re, M1), false)
})
