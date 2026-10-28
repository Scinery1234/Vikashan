import test from 'node:test'
import assert from 'node:assert/strict'

test('sendMail throws when env is missing', async () => {
  delete process.env.RESEND_API_KEY
  const { sendMail } = await import('../lib/newpage-mail.js')
  await assert.rejects(() => sendMail({ to: 'a@b.co' }), /RESEND_API_KEY/)
})

test('sendMail throws when Resend returns an error object', async () => {
  process.env.RESEND_API_KEY = 're_test'
  process.env.FROM_EMAIL = 'hello@example.com'
  const real = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ name: 'validation_error', message: 'The example.com domain is not verified.', statusCode: 403 }), { status: 403, headers: { 'content-type': 'application/json' } })
  try {
    const { sendMail } = await import('../lib/newpage-mail.js')
    await assert.rejects(() => sendMail({ from: 'x', to: 'a@b.co', subject: 's', html: 'h' }), /not verified/)
  } finally { globalThis.fetch = real }
})
