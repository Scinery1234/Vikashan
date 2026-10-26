// New Page quiz: questions, scoring and plan content.
// Shared by the browser (newpage/quiz.js) and the API (api/newpage/*), so the
// server can re-score answers itself instead of trusting the client.

import { PLANS } from './plans.js'

export const SCALE = ['Not like me', 'A little like me', 'Mostly like me', 'Very like me']

// Clarity: statements 1, 3, 5, 7. Capacity: 2, 4, 6, 8. Statement 4 is reversed.
export const STATEMENTS = [
  { key: 's1', axis: 'clarity', text: 'I can describe the kind of work I want next in one sentence.' },
  { key: 's2', axis: 'capacity', text: 'I have some energy left at the end of most days.' },
  { key: 's3', axis: 'clarity', text: 'I know what matters most to me in a job.' },
  { key: 's4', axis: 'capacity', reverse: true, text: 'I feel burnt out, at work or in life.' },
  { key: 's5', axis: 'clarity', text: 'I feel a sense of purpose in life.' },
  { key: 's6', axis: 'capacity', text: 'When I decide to do something, I usually get started.' },
  { key: 's7', axis: 'clarity', text: 'I’m clear on my next steps.' },
  { key: 's8', axis: 'capacity', text: 'Thinking about my career feels more hopeful than heavy.' }
]

export const SITUATIONS = [
  { v: 'employed', l: 'I’m employed or earning an income' },
  { v: 'between', l: 'Between jobs' },
  { v: 'returning', l: 'Coming back after a break' },
  { v: 'change', l: 'Wanting to change careers' },
  { v: 'study', l: 'Studying or early in my career' },
  { v: 'other', l: 'Something else' }
]

// Value 4 adds a gentle support line to the result; 5 shows the support
// screen first and turns off all sales prompts and emails.
export const FEELINGS = ['Really good', 'Mostly good', 'Up and down', 'Mostly low', 'I’m really struggling']
export const FEEL_LOW = 4
export const FEEL_STRUGGLING = 5

export const TIMEFRAMES = [
  { v: 'exploring', l: 'I’m just exploring' },
  { v: 'soon', l: 'In the next 3 to 6 months' },
  { v: 'asap', l: 'As soon as I can' }
]

export const BLOCKERS = [
  { v: 'confidence', l: 'Confidence' },
  { v: 'time', l: 'Time' },
  { v: 'options', l: 'Not knowing my options' },
  { v: 'energy', l: 'Low energy or burnout' },
  { v: 'apps', l: 'My applications aren’t landing' }
]

export const COACH = [
  { v: 'yes', l: 'Yes, I’d like that' },
  { v: 'later', l: 'Maybe later' },
  { v: 'no', l: 'No, just the plan for now' }
]

const scaleOpts = () => SCALE.map((l, i) => ({ l, v: i + 1 }))

// The question list depends on earlier answers: the job-satisfaction question
// only appears for people who are working or changing careers.
export function buildQuestions(answers = {}) {
  const list = STATEMENTS.map(s => ({
    key: s.key, section: 'About you', prompt: 'How much is this like you right now?', text: s.text, opts: scaleOpts()
  }))
  list.push({
    key: 'sit', section: 'Your situation', prompt: '', text: 'Which fits you best right now?',
    opts: SITUATIONS.map(o => ({ l: o.l, v: o.v }))
  })
  if (showsSatisfaction(answers)) {
    list.push({
      key: 'sat', section: 'Your situation', prompt: 'How much is this like you right now?',
      text: 'I’m satisfied with my job.', opts: scaleOpts()
    })
  }
  list.push({
    key: 'feel', section: 'How you’re going', prompt: '',
    text: 'Over the last couple of weeks, how have you been feeling overall?',
    opts: FEELINGS.map((l, i) => ({ l, v: i + 1 }))
  })
  return list
}

export function showsSatisfaction(answers) {
  return answers.sit === 'employed' || answers.sit === 'change'
}

const isScale = v => Number.isInteger(v) && v >= 1 && v <= 4

// Returns null when an answer is missing or out of range.
export function validateAnswers(answers) {
  if (!answers || typeof answers !== 'object') return null
  const clean = {}
  for (const s of STATEMENTS) {
    if (!isScale(answers[s.key])) return null
    clean[s.key] = answers[s.key]
  }
  if (!SITUATIONS.some(o => o.v === answers.sit)) return null
  clean.sit = answers.sit
  if (showsSatisfaction(clean)) {
    if (!isScale(answers.sat)) return null
    clean.sat = answers.sat
  }
  if (!(Number.isInteger(answers.feel) && answers.feel >= 1 && answers.feel <= FEELINGS.length)) return null
  clean.feel = answers.feel
  return clean
}

export const HIGH = 11 // per axis, out of 16

export function score(answers) {
  let clarity = 0
  let capacity = 0
  for (const s of STATEMENTS) {
    const v = answers[s.key]
    const pts = s.reverse ? 5 - v : v
    if (s.axis === 'clarity') clarity += pts
    else capacity += pts
  }
  const quadrant = quadrantFor(clarity >= HIGH, capacity >= HIGH)
  return {
    clarity,
    capacity,
    quadrant,
    // Position on the grid, 0 to 100 on each axis.
    x: Math.round(((capacity - 4) / 12) * 100),
    y: Math.round(((clarity - 4) / 12) * 100),
    burnout: answers.s4 >= 3,
    lowMood: answers.feel === FEEL_LOW,
    struggling: answers.feel === FEEL_STRUGGLING
  }
}

function quadrantFor(highClarity, highCapacity) {
  if (highClarity) return highCapacity ? 'launch' : 'unstick'
  return highCapacity ? 'explore' : 'recharge'
}

// People who want a coach, or want change as soon as possible, are offered a
// free intro call. Never after the safety screen.
export function offersIntroCall({ coach, time }, result) {
  if (result.struggling) return false
  return coach === 'yes' || time === 'asap'
}

export const QUADRANTS = {
  recharge: {
    name: 'Recharge',
    color: '#CDBDFF',
    tint: '#EFEAFF',
    tag: 'Rest first, then the next page.',
    meaning: 'You’re running low on energy and the way forward isn’t clear yet. That’s a really common place to be, and it’s not a sign you’re doing anything wrong. When you’re depleted, pushing for big decisions usually backfires. Rest and steadiness come first. Clarity tends to follow.',
    oneLine: 'running low on energy, with the way forward not clear yet',
    week1: 'Pick one small daily reset that takes 10 minutes or less, like a walk, a proper lunch break or an earlier night, and keep it for seven days. That’s it. That’s week one.',
    weeks: PLANS.recharge,
  },
  explore: {
    name: 'Explore',
    color: '#A8DBFF',
    tint: '#E4F4FF',
    tag: 'Energy, ideas, and a new page to fill.',
    meaning: 'You’ve got energy to put into a change. What’s missing is a clear direction to point it at. That’s a good problem to have. The risk is spending that energy on scattered applications or endless research. The next step is getting clear on what you value and what you’re good at, then testing a few ideas in the real world.',
    oneLine: 'full of energy for a change, but without a clear direction yet',
    week1: 'Write down the five things that matter most to you in work, in order. Then list three things you know, three things you can do well, and three things you love. Keep them somewhere you’ll see them.',
    weeks: PLANS.explore,
  },
  unstick: {
    name: 'Unstick',
    color: '#FFC27A',
    tint: '#FFF0DC',
    tag: 'One small step, then the next.',
    meaning: 'You have a fair idea of where you want to go, but getting started feels harder than it should. That’s not laziness. It’s usually a mix of low energy, too many moving parts and something underneath that makes the first step feel heavy. The way through is smaller steps than you think, and some support with what’s in the way.',
    oneLine: 'fairly clear on where you want to go, but finding it hard to get started',
    week1: 'Name the one career task you keep putting off. Then shrink it until it takes 15 minutes, like “open my resume and fix the first section”. Do that one thing this week.',
    weeks: PLANS.unstick,
  },
  launch: {
    name: 'Launch',
    color: '#C9EF6E',
    tint: '#EEF9D3',
    tag: 'Ready to turn the page.',
    meaning: 'You know where you’re heading and you’ve got the energy to go for it. Now it’s about doing it well: applications that are tailored, not sprayed, a steady weekly rhythm, and good preparation for interviews. A system beats bursts of effort.',
    oneLine: 'clear on where you’re heading and ready to go for it',
    week1: 'Choose your target role in one line, then find three real job ads for it. Highlight the words that come up in all three. Those are what your resume needs to show.',
    weeks: PLANS.launch,
  }
}

// One tip per answer to "What's most in the way?".
export const BLOCKER_TIPS = {
  confidence: 'Keep a wins list as you go, and add a strengths step to week one.',
  time: 'Keep every step to 30 minutes or less, and book the time in your calendar first.',
  options: 'Do the week-two options exercise early: ten ideas in 20 minutes, with no filtering.',
  energy: 'Go gently: keep each step to its smallest version and put rest first.',
  apps: 'Check your resume against three job ads, and write a tailored cover letter for your next application.'
}

// Extra lines added to the plan from the situation and personalise answers.
export function planTweaks(answers, personal = {}, result = score(answers)) {
  const tweaks = []
  const sat = answers.sat
  if (answers.sit === 'employed' && sat) {
    if (sat <= 2) tweaks.push('Your steps are sized for evenings and weekends. One question to sit with: what would need to change in your current job for you to stay?')
    else tweaks.push('You’re mostly happy in your job, so start by looking for growth where you are, like a promotion, a new project or shaping your role, before looking elsewhere.')
  }
  const bySituation = {
    between: 'Set yourself a simple daily routine in week one. Structure helps a lot between jobs, and check what income support you can access.',
    returning: 'In week one, list the skills you gained during your break. When you update your resume, include a short, confident line about the gap.',
    change: 'Add a list of your transferable skills, and plan one informational interview with someone already in the field.',
    study: 'Where the plan says “apply”, build experience instead: volunteering, projects or an internship.'
  }
  if (bySituation[answers.sit]) tweaks.push(bySituation[answers.sit])

  if (personal.time === 'exploring') tweaks.push('Take this at a softer pace. One step a week is plenty.')
  if (personal.time === 'asap') tweaks.push('Want to move fast? Start on your resume in week one.')

  // Burnout gets its own line below.
  if (personal.block !== 'energy' && BLOCKER_TIPS[personal.block]) tweaks.push(BLOCKER_TIPS[personal.block])
  if (result.burnout || personal.block === 'energy') tweaks.push('You mentioned feeling burnt out, so put rest first and keep every step small. If it’s been going on for weeks, it’s worth talking to your GP or a counsellor.')
  return tweaks
}
