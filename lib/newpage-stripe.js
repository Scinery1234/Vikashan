import Stripe from 'stripe'
import { PRICE, hoursTotalCents } from './newpage-pricing.js'

let client = null
export const stripe = () => (client ||= new Stripe(process.env.STRIPE_SECRET_KEY))
export const setStripe = c => { client = c } // for tests

const base = () => process.env.NEXT_PUBLIC_URL || 'https://vikashan.com.au'
const line = (name, cents, quantity = 1) => ({ quantity, price_data: { currency: 'aud', unit_amount: cents, product_data: { name } } })

// What Stripe Checkout is asked to charge. Built here from the fixed prices only.
export function joinSessionParams({ email, name, hours }) {
  const meta = { kind: 'newpage_join', email, name: name || '', hours: String(hours) }
  return {
    mode: 'payment', customer_email: email,
    line_items: [line('New Page: 4 weeks with a coach in your corner', PRICE.programCents), ...(hours ? [line('Extra 1:1 hour with Vik', PRICE.hourCents, hours)] : [])],
    metadata: meta, payment_intent_data: { metadata: meta, description: 'New Page' },
    success_url: `${base()}/newpage/join?done=1&sid={CHECKOUT_SESSION_ID}`, cancel_url: `${base()}/newpage/join?cancelled=1`
  }
}

export function renewSessionParams({ member }) {
  const meta = { kind: 'newpage_renew', memberId: member.id }
  return {
    mode: 'payment', customer_email: member.email,
    line_items: [line('New Page: one more month, with a 1:1 session', PRICE.renewCents)],
    metadata: meta, payment_intent_data: { metadata: meta, description: 'New Page renewal' },
    success_url: `${base()}/newpage/app?paid=renew`, cancel_url: `${base()}/newpage/app`
  }
}

export function hoursSessionParams({ member, hours }) {
  const meta = { kind: 'newpage_hours', memberId: member.id, hours: String(hours) }
  return {
    mode: 'payment', customer_email: member.email,
    line_items: [line('Extra 1:1 hour with Vik', PRICE.hourCents, hours)],
    metadata: meta, payment_intent_data: { metadata: meta, description: 'New Page extra hours' },
    success_url: `${base()}/newpage/app?paid=hours`, cancel_url: `${base()}/newpage/app`
  }
}

// Sky and the tools, $25 a month, as a Stripe subscription. The first month is
// charged at checkout; Stripe charges each month after that and tells us by webhook.
export function toolsSessionParams({ email, name }) {
  const meta = { kind: 'newpage_tools', email, name: name || '' }
  return {
    mode: 'subscription', customer_email: email,
    line_items: [{ quantity: 1, price_data: { currency: 'aud', unit_amount: PRICE.toolsCents, recurring: { interval: 'month' }, product_data: { name: 'Sky and the tools: New Page monthly membership' } } }],
    metadata: meta, subscription_data: { metadata: meta },
    allow_promotion_codes: true,
    success_url: `${base()}/newpage/join?done=1&sid={CHECKOUT_SESSION_ID}`, cancel_url: `${base()}/newpage/sky?cancelled=1`
  }
}

// Stripe's own page for changing a card or cancelling.
export async function billingPortalUrl(customerId) {
  const s = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${base()}/newpage/app#me` })
  return s.url
}

export { hoursTotalCents }
