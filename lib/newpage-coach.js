// The Career Coach inside the New Page app: a conversation with Claude that
// knows the member's plan, tasks and notes. Calls the Anthropic Messages API
// directly, so no extra package is needed.
import { QUADRANTS } from '../newpage/quiz-logic.js'
import { programPosition } from './newpage-app.js'

export const COACH_MODEL = () => process.env.NEWPAGE_COACH_MODEL || 'claude-sonnet-5-5'
const MAX_TOOL_ROUNDS = 3

export function coachSystem({ member, tasks, memory, now = Date.now() }) {
  const Q = member.quadrant ? QUADRANTS[member.quadrant] : null
  const pos = programPosition(member.plan_started_at, now)
  const week = Q ? Q.weeks[pos.week - 1] : null
  const open = tasks.filter(t => !t.done).slice(0, 12)
  return [
    'You are the Career Coach inside New Page, a 4-week career program by Vikashan, run by Vik (a career counsellor and psychotherapist in Sydney).',
    'You help people work out where they are in their career and take small, real steps. You are warm, plain and a little cheeky, like a good coach across a table. Use Australian spelling.',
    '',
    'How to talk:',
    '- Keep replies short: usually under 120 words. Ask one question at a time.',
    '- Be specific and practical. Prefer small steps ("shrink it to 15 minutes") over big plans.',
    '- Never promise outcomes. Never diagnose, label or give medical, legal or financial advice.',
    '- This is coaching, not therapy. If someone seems to be struggling, be kind, say so plainly, and point them to Lifeline (13 11 14), Beyond Blue (1300 22 4636) or 000 in an emergency, and to their GP or a counsellor.',
    '- You are an AI. Say so if asked. Vik is a real person: the member has one 60-minute 1:1 session with Vik, usually in weeks 2 to 3. Suggest it when it would help; do not pretend to be Vik.',
    '- Only offer tools you have. You can save a note to remember something about the member (save_memory) and add a task to their list (add_task). Offer first, then do it once they agree or ask.',
    '',
    `About this member: ${member.name || 'a New Page member'}.`,
    Q ? `Their quiz result: ${Q.name} (${Q.tag}). ${Q.oneLine}.` : 'They have not taken the check-in yet. Suggest they do the check-in on the Me tab.',
    Q ? `They are on day ${pos.day}, week ${pos.week} of 4${pos.complete ? ' (the four weeks are done)' : ''}: "${week.title}" - ${week.why}` : '',
    week ? `This week's steps: ${week.steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}` : '',
    open.length ? `Their open tasks: ${open.map(t => t.title + (t.due ? ` (due ${t.due})` : '')).join('; ')}.` : 'They have no open tasks.',
    memory.length ? `What you remember about them: ${memory.map(m => m.note).join(' | ')}` : 'You have no saved notes about them yet.'
  ].filter(Boolean).join('\n')
}

export const COACH_TOOLS = [
  {
    name: 'save_memory',
    description: 'Save one short, useful fact about the member so you remember it next time (for example their target role, what is getting in the way, or a decision they made). Third person, under 200 characters. Do not save anything sensitive about health.',
    input_schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] }
  },
  {
    name: 'add_task',
    description: 'Add a task to the member\'s task list. Only after they agree or ask. Keep the title short and concrete.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, due: { type: 'string', description: 'Optional date, YYYY-MM-DD' } }, required: ['title'] }
  }
]

// Alternating user/assistant turns, starting with a user turn.
export function toApiMessages(history, newMessage) {
  const turns = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: newMessage }]
  const merged = []
  for (const t of turns) {
    const last = merged[merged.length - 1]
    if (last && last.role === t.role) last.content += '\n\n' + t.content
    else merged.push({ ...t })
  }
  while (merged.length && merged[0].role !== 'user') merged.shift()
  return merged
}

async function callApi(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Coach API ${res.status}`)
  return res.json()
}

// Runs the conversation, executing tool calls through `tools.run(name, input)`.
// Returns the reply text and the tool results that were used.
export async function runCoach({ system, messages, tools }) {
  const convo = [...messages]
  const used = []
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const data = await callApi({ model: COACH_MODEL(), max_tokens: 700, system, messages: convo, tools: COACH_TOOLS })
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    const calls = (data.content || []).filter(b => b.type === 'tool_use')
    if (data.stop_reason !== 'tool_use' || !calls.length || round === MAX_TOOL_ROUNDS) {
      return { text: text || 'Sorry, I lost my words for a second. Could you say that again?', used }
    }
    convo.push({ role: 'assistant', content: data.content })
    const results = []
    for (const c of calls) {
      let out
      try { out = await tools.run(c.name, c.input || {}) } catch { out = 'That did not work.' }
      used.push({ name: c.name, input: c.input, result: out })
      results.push({ type: 'tool_result', tool_use_id: c.id, content: String(out) })
    }
    convo.push({ role: 'user', content: results })
  }
}
