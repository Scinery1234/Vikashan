// What Sky knows about a member, and who else may see it.
//
// Privacy levels (what Vik, the human coach, can see; Sky always uses the
// member's context, or it couldn't coach them):
//   private  nothing: Vik can't see chats or what Sky has learned
//   share    only what the member chooses to share with the Share button
//   all      all their chats and what Sky has learned
// A member who hasn't chosen yet (null) is treated as private.
export const PRIVACY = ['private', 'share', 'all']
export const PRIVACY_TEXT = {
  private: { title: 'Nothing', body: 'Vik can’t see your chats with Sky or what Sky has learned about you. Sky still uses it to coach you.' },
  share: { title: 'Only what I share', body: 'Vik sees a chat, or your context, only when you press “Share with Vik”. You can take a share back any time.' },
  all: { title: 'All my chats', body: 'Vik can read your chats with Sky and what Sky has learned about you, including your answers about yourself and your resume.' }
}
export const cleanPrivacy = v => (PRIVACY.includes(v) ? v : null)

export const MBTI = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ']

// "About you": every question is optional. `type` is select, text or long.
export const ABOUT = [
  { id: 'mbti', label: 'Your Myers-Briggs type', type: 'select', options: [...MBTI, 'Not sure', 'I haven’t taken it'], hint: 'If you know it. Sky uses it lightly, as one clue about how you like to work, never as a label.' },
  { id: 'otherTypes', label: 'Other personality or strengths results', type: 'text', hint: 'For example Enneagram, DISC, CliftonStrengths or VIA.', max: 200 },
  { id: 'stage', label: 'Where are you in your working life right now?', type: 'select', options: ['Studying', 'Starting out', 'Working and happy', 'Working and unhappy', 'Between jobs', 'Returning after a break', 'Changing fields', 'Winding down'] },
  { id: 'strengths', label: 'What do people say you’re good at?', type: 'long', max: 500 },
  { id: 'energy', label: 'What gives you energy at work, and what drains you?', type: 'long', max: 600 },
  { id: 'style', label: 'How do you like to work?', type: 'select', options: ['Mostly on my own', 'A mix', 'Mostly with people'] },
  { id: 'limits', label: 'Is anything limiting your options?', type: 'long', hint: 'Hours, location, caring, health, visa. Share only what you’re comfortable with.', max: 600 },
  { id: 'goals', label: 'What would a good year look like?', type: 'long', max: 600 },
  { id: 'coachStyle', label: 'How would you like Sky to coach you?', type: 'select', options: ['Gently', 'Straight talk', 'A mix', 'Challenge me'] },
  { id: 'more', label: 'Anything else you’d like Sky to know?', type: 'long', max: 800 }
]

export function cleanAbout(raw) {
  const b = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const q of ABOUT) {
    const v = typeof b[q.id] === 'string' ? b[q.id].trim() : ''
    if (!v) continue
    if (q.type === 'select') { if (q.options.includes(v)) out[q.id] = v } else out[q.id] = v.slice(0, q.max || 500)
  }
  return out
}

export const aboutLines = about => ABOUT.filter(q => about?.[q.id]).map(q => `${q.label} ${about[q.id]}`)

// The notes Sky keeps. Short, one fact each.
export const cleanNote = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 300) : '')
export const MEMORY_LIMIT = 80

// True when a new note says what one already does (so Sky doesn't keep repeating itself).
export function isDuplicateNote(note, existing) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  const n = norm(note)
  return existing.some(e => { const x = norm(e); return x === n || (x.length > 20 && n.includes(x)) || (n.length > 20 && x.includes(n)) })
}

// What a "share" captures.
export const SHARE_KINDS = ['chat', 'context']
export const CHAT_SHARE_LIMIT = 40
