// How long Sky's memory is kept after a membership ends.
//
//   day 0    membership ends (access date passes, or the member is ended)
//   day 7    reminder: your memory is kept for 23 more days
//   day 14   reminder: 16 days left
//   day 30   moves to the Trash and a notice is sent. Sky can't use it, and it
//            stays encrypted. Coming back to New Page restores it.
//   +12 mo   permanently deleted, including the key that unlocks it
//
// Kept apart from the database code so the rules can be tested on their own.
export const DAY = 24 * 60 * 60 * 1000
export const RETENTION = { remindDays: [7, 14], trashDay: 30, purgeDays: 365 }

const when = v => (v ? new Date(v).getTime() : null)

export function hasAccess(member, now = Date.now()) {
  if (member.status !== 'active') return false
  const until = when(member.access_until)
  return until == null || until >= now
}

// When the membership ended, or null if it hasn't (paused members haven't ended).
export function endedAt(member, now = Date.now()) {
  if (member.access_ended_at) return when(member.access_ended_at)
  if (member.status === 'ended') return now
  const until = when(member.access_until)
  if (member.status === 'active' && until != null && until < now) return until
  return null
}

export const trashOn = ended => new Date(ended + RETENTION.trashDay * DAY)
export const purgeOn = trashed => new Date(when(trashed) + RETENTION.purgeDays * DAY)

// What to do for one member right now. Returns { step, day?, ended }:
//   restore  they're back: clear the clock (and bring memory back from the Trash)
//   mark     the membership has ended: record when
//   remind   send the day-7 or day-14 reminder
//   trash    move memory to the Trash (and send the notice)
//   notice   it is in the Trash but the notice never got through: send it again
//   purge    the 12 months are up: delete it for good
//   none     nothing to do
export function retentionStep(member, now = Date.now()) {
  const state = member.memory_state || 'active'
  if (hasAccess(member, now)) {
    return member.access_ended_at || state !== 'active' ? { step: 'restore' } : { step: 'none' }
  }
  if (member.status === 'paused') return { step: 'none' }
  if (state === 'purged') return { step: 'none' }
  const ended = endedAt(member, now)
  if (ended == null) return { step: 'none' }
  if (!member.access_ended_at) return { step: 'mark', ended }
  if (state === 'trash') {
    if (member.memory_trashed_at && when(member.memory_trashed_at) + RETENTION.purgeDays * DAY <= now) return { step: 'purge', ended }
    return (member.memory_reminder || 0) < RETENTION.trashDay ? { step: 'notice', day: RETENTION.trashDay, ended } : { step: 'none', ended }
  }
  const days = Math.floor((now - ended) / DAY)
  const last = member.memory_reminder || 0
  if (days >= RETENTION.trashDay) return { step: 'trash', day: RETENTION.trashDay, ended }
  for (const d of [...RETENTION.remindDays].reverse()) if (days >= d && last < d) return { step: 'remind', day: d, ended }
  return { step: 'none', ended }
}
