// Sky, the AI Coach inside the New Page app: a conversation with Claude that
// knows the member's plan, tasks and notes. Calls the Anthropic Messages API
// directly, so no extra package is needed.
import { QUADRANTS } from '../newpage/quiz-logic.js'
import { PROGRAM } from '../newpage/program-content.js'
import { programPosition } from './newpage-app.js'
import { COACHES, coachSafety } from './newpage-coaches.js'
import { PRIVACY_TEXT, aboutLines } from './newpage-context.js'

export const COACH_MODEL = () => process.env.NEWPAGE_COACH_MODEL || 'claude-sonnet-5-5'
const MAX_TOOL_ROUNDS = 3

export function coachSystem({ member, tasks, memory, compass = null, coach = 'career', now = Date.now(), about = {}, resume = '', learn = false, privacy = null }) {
  const Q = member.quadrant ? QUADRANTS[member.quadrant] : null
  const pos = programPosition(member.plan_started_at, now)
  const week = Q ? PROGRAM[member.quadrant][pos.week - 1] : null
  const open = tasks.filter(t => !t.done).slice(0, 12)
  const special = COACHES[coach]?.prompt
  const focus = COACHES[coach]?.name || 'Career'
  const role = special
    ? [
        `You are Sky, the AI Coach inside New Page, a 4-week career program by Purposefields, run by Vik (a career counsellor and psychotherapist in Sydney). Sky has nine focus areas that share one memory and one task list. The member has chosen the "${focus}" focus.`,
        special,
        coachSafety,
        'Keep replies short: usually under 120 words, one question at a time. Use Australian spelling. You are an AI called Sky; Vik is a real person, and the member has one 60-minute 1:1 session with him. Never answer as Vik. You can add a task (add_task) once they agree or ask.'
      ]
    : [
        'You are Sky, the AI Coach inside New Page, a 4-week career program by Purposefields, run by Vik (a career counsellor and psychotherapist in Sydney). The member has chosen the "Career" focus, which is your default.',
        'You help people work out where they are in their career and take small, real steps. You are warm, plain and a little cheeky, like a good coach across a table. Use Australian spelling.',
        '',
        'How to talk:',
        '- Keep replies short: usually under 120 words. Ask one question at a time.',
        '- Be specific and practical. Prefer small steps ("shrink it to 15 minutes") over big plans.',
        '- Never promise outcomes. Never diagnose, label or give medical, legal or financial advice.',
        '- This is coaching, not therapy. If someone seems to be struggling, be kind, say so plainly, and point them to Lifeline (13 11 14), Beyond Blue (1300 22 4636) or 000 in an emergency, and to their GP or a counsellor.',
        '- You are an AI called Sky. Say so if asked. Vik is a real person: the member has one 60-minute 1:1 session with Vik, usually in weeks 2 to 3. Suggest it when it would help; never pretend to be Vik.',
        '- You can add a task to their list (add_task). Offer first, then do it once they agree or ask.',
        '- You have other focus areas the member can switch to (Recovery, Action, Executive function, Reducing the charge, CBT, Interview, Offer and negotiation, Clarity compass). They also have tools (planner, notes, the Compass, a Career Direction Report, resume, cover letter, LinkedIn profile and outreach message writers, and a session brief for Vik) in the Coach and Tools tabs. Point to the right one when it would help.'
      ]
  return [
    ...role,
    '',
    `About this member: ${member.name || 'a New Page member'}.`,
    Q ? `Their quiz result: ${Q.name} (${Q.tag}). ${Q.oneLine}.` : 'They have not taken the check-in yet. Suggest they do the check-in on the Me tab.',
    Q ? `They are on day ${pos.day}, week ${pos.week} of 4${pos.complete ? ' (the four weeks are done)' : ''}: "${week.title}" - ${week.goal}` : '',
    week?.tool === 'compass' ? 'This week\'s featured tool is the Compass (Tools tab): ten short steps from values to first steps. Suggest it when it fits, and help them reflect on what they find. Never judge whether their direction is realistic.' : '',
    week ? `This week's tasks: ${week.tasks.map((t, i) => `${i + 1}) ${t.text}`).join(' ')}` : '',
    week ? `By the end of the week they should have: ${week.deliverables.join('; ')}.` : '',
    open.length ? `Their open tasks: ${open.map(t => t.title + (t.due ? ` (due ${t.due})` : '')).join('; ')}.` : 'They have no open tasks.',
    compass && (compass.first || compass.north) ? `Their Compass (their own words): top pick direction "${compass.first || 'not chosen yet'}"; top values ${compass.values.slice(0, 5).join(', ') || 'not set'}; #1 I am "${compass.iAm[0] || 'not set'}"; North Star: ${compass.north.slice(0, 400) || 'not written'}. Use this quietly and never judge whether their direction is realistic.` : '',
    Object.keys(about || {}).length ? `What they told you about themselves (their own answers): ${aboutLines(about).join(' | ')}` : '',
    about?.mbti && /^[A-Z]{4}$/.test(about.mbti) ? `They gave their Myers-Briggs type as ${about.mbti}. Treat it as one clue about how they like to work, never as a label or a limit, and don't lecture about it.` : '',
    resume ? `Their resume, in their own words (shortened): ${resume.slice(0, 3000)}` : '',
    memory.length ? `What you remember about them from earlier chats: ${memory.slice(-60).map(m => String(m.note).slice(0, 200)).join(' | ')}` : 'You have no saved notes about them yet.',
    learn
      ? 'Keeping notes: when you learn something lasting about them (what they want, strengths, limits, preferences, decisions, what is going on in their life), save it straight away with save_memory. Do not ask first and do not announce it. Keep each note to one short fact in the third person. Do not save passing details, and do not save sensitive health details unless they ask you to. Do not repeat a note you already have.'
      : 'Note-keeping is switched off for this member: do not try to save notes.',
    `Who can see this chat: ${privacy ? PRIVACY_TEXT[privacy].body : 'Vik can’t see it unless they choose to share it.'} If they ask, tell them this plainly and that they can change it in Your context.`
  ].filter(x => x !== null && x !== undefined && x !== false).join('\n')
}

export const COACH_TOOLS = [
  {
    name: 'save_memory',
    description: 'Keep one short, lasting fact about the member so you remember it next time (for example their target role, what is getting in the way, a strength, a limit, or a decision they made). Use it as soon as you learn something, without asking and without mentioning it. Third person, under 200 characters. Do not save anything sensitive about health unless they ask you to.',
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
export async function runCoach({ system, messages, tools, learn = true }) {
  const defs = learn ? COACH_TOOLS : COACH_TOOLS.filter(t => t.name !== 'save_memory')
  const convo = [...messages]
  const used = []
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const data = await callApi({ model: COACH_MODEL(), max_tokens: 700, system, messages: convo, tools: defs })
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

// One structured answer from the model: forces a single tool call and returns
// its input. `schema` is a JSON Schema object.
export async function askJson({ system, prompt, schema, maxTokens = 3000 }) {
  const data = await callApi({
    model: COACH_MODEL(), max_tokens: maxTokens, system,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ name: 'answer', description: 'Give your answer in this exact shape.', input_schema: schema }],
    tool_choice: { type: 'tool', name: 'answer' }
  })
  const call = (data.content || []).find(b => b.type === 'tool_use')
  if (!call) throw new Error('No structured answer')
  return call.input || {}
}
