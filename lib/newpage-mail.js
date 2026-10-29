import { Resend } from 'resend'

// The Resend SDK does not throw when the API refuses a message (unverified
// domain, bad key, invalid address): it returns { data, error }. This wrapper
// turns that into a thrown error so callers' try/catch really sees failures.
let client
export async function sendMail(payload) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  if (!process.env.FROM_EMAIL) throw new Error('FROM_EMAIL is not set')
  client = client || new Resend(process.env.RESEND_API_KEY)
  const { data, error } = await client.emails.send(payload)
  if (error) throw new Error(`Resend refused the email: ${error.name || ''} ${error.message || JSON.stringify(error)}`.trim())
  return data
}

export const fromAddress = () => `${process.env.FROM_NAME || 'Vikashan'} <${process.env.FROM_EMAIL}>`
