import { supabase } from '../../lib/supabase.js'
import { sendReminder24h, sendReminder1h, sendFollowUp, sendPaymentPlanReceipt } from '../../lib/resend.js'
import { syncCalendarAvailability } from '../../lib/calendar-sync.js'
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in1h  = new Date(now.getTime() +      60 * 60 * 1000)
  const ago2h = new Date(now.getTime() -  2 * 60 * 60 * 1000)

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, clients(*), session_types(name)')
    .eq('status', 'confirmed')

  const sent = { reminder24h: 0, reminder1h: 0, followup: 0 }

  for (const booking of bookings ?? []) {
    const sessionStart = new Date(`${booking.date}T${booking.start_time}`)
    const sessionEnd   = new Date(sessionStart.getTime() + booking.duration_mins * 60000)

    const diff24 = Math.abs(sessionStart - in24h)
    if (!booking.reminder_24h_sent && diff24 < 10 * 60 * 1000) {
      await sendReminder24h({ booking: { ...booking, session_type_name: booking.session_types.name }, client: booking.clients })
      await supabase.from('bookings').update({ reminder_24h_sent: true }).eq('id', booking.id)
      sent.reminder24h++
    }

    const diff1h = Math.abs(sessionStart - in1h)
    if (!booking.reminder_1h_sent && diff1h < 10 * 60 * 1000) {
      await sendReminder1h({ booking: { ...booking, session_type_name: booking.session_types.name }, client: booking.clients })
      await supabase.from('bookings').update({ reminder_1h_sent: true }).eq('id', booking.id)
      sent.reminder1h++
    }

    if (!booking.followup_sent && sessionEnd < ago2h) {
      await sendFollowUp({ booking, client: booking.clients })
      await supabase.from('bookings')
        .update({ followup_sent: true, status: 'completed' })
        .eq('id', booking.id)
      sent.followup++
    }
  }

  // Process due payment plan instalments
  const today = now.toISOString().slice(0, 10)
  const { data: duePlans } = await supabase
    .from('packages')
    .select('*, clients(*)')
    .eq('payment_plan', true)
    .eq('status', 'active')
    .lte('next_charge_date', today)
    .lt('instalments_paid', 'instalments_total')

  const plansSent = { charged: 0, failed: 0 }

  for (const pkg of duePlans ?? []) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: pkg.instalment_amount_cents,
        currency: 'aud',
        customer: pkg.stripe_customer_id,
        payment_method: pkg.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        description: `Vikashan payment plan — instalment ${pkg.instalments_paid + 1} of ${pkg.instalments_total}`,
        receipt_email: pkg.clients.email,
        metadata: { packageId: pkg.id, instalment: String(pkg.instalments_paid + 1) }
      })

      if (intent.status === 'succeeded') {
        const newPaid = pkg.instalments_paid + 1
        const isComplete = newPaid >= pkg.instalments_total
        const nextCharge = new Date()
        nextCharge.setMonth(nextCharge.getMonth() + 1)

        const remainingBalance = (pkg.sessions_total * pkg.amount_cents_per_session) - (newPaid * pkg.instalment_amount_cents)
        const nextChargeDateStr = isComplete || remainingBalance <= 0 ? null : (() => {
          const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
        })()
        await supabase.from('packages').update({
          instalments_paid: newPaid,
          status: isComplete || remainingBalance <= 0 ? 'completed' : 'active',
          next_charge_date: nextChargeDateStr
        }).eq('id', pkg.id)

        await sendPaymentPlanReceipt({
          client: pkg.clients,
          instalmentNum: newPaid,
          instalmentTotal: pkg.instalments_total,
          amountCents: pkg.instalment_amount_cents,
          isComplete
        })
        plansSent.charged++
      }
    } catch {
      plansSent.failed++
    }
  }

  // Sync Google + Outlook calendar availability
  const calSync = await syncCalendarAvailability().catch(e => ({ error: e.message }))

  res.json({ success: true, sent, plansSent, calSync, checked: bookings?.length ?? 0 })
}
