// The paid New Page program: what members work through inside the app.
// This is separate from the free emailed plan (plans.js), which is a short
// outline anyone gets from the quiz. The program is the full course for each
// type: short readings, guided tasks that use the tools, templates, and the
// documents the tools produce.
//
// Shape of a week:
//   title, goal, deliverables[]   what they will have by the end of the week
//   lessons[]    { id, title, minutes, body[] }  body lines: '## ' heading, '- ' bullet, else paragraph
//   tasks[]      { text, minutes, tool?, coach?, prompt? }  tool opens a tool, coach opens a coach (prompt pre-fills it)
//   templates[]  { title, text }   copy-and-fill scripts
//   reflect      one question to talk through with a coach
//   tool         'compass' on the week the Compass is featured (Launch 1, Unstick 2, Explore 3, Recharge 4)
//
// Tools: compass, planner, resume, cover, linkedin, outreach, report, brief, progress, session
// Coaches: career, recovery, action, exec, charge, cbt, clarity, interview, offer

import { READINGS } from './program-readings.js'

export const TOOL_IDS = ['compass', 'planner', 'resume', 'cover', 'linkedin', 'outreach', 'report', 'brief', 'progress', 'session']

export const PROGRAM = {
  // ───────────────────────── LAUNCH ─────────────────────────
  launch: [
    {
      title: 'Confirm your direction',
      goal: 'You’re clear and you have energy. Before you spend it on applications, make sure the role really fits your life, so the next three weeks are aimed at the right target.',
      deliverables: ['Your Compass: values, North Star, must-haves and a plan', 'A confirmed target role, plus two alternatives', 'Your personal Career Direction Report', 'Your 1:1 with Vik booked'],
      lessons: [
        { id: 'l1-direction', title: 'Why direction beats effort', minutes: 5, body: [
          'The most common way to waste a job search is to apply hard to the wrong target. Fifty applications for a role that doesn’t fit your life will cost you months, and an offer you take for the wrong reasons costs more.',
          'So the first week is not about applications. It’s about a short, honest check: does this role fit the life you want, and what would you need from it?',
          '## What a good target looks like',
          '- It uses strengths you enjoy using, not only ones you’re good at.',
          '- It fits your must-haves: pay, hours, stress, and where you work.',
          '- You can describe it in one line, and so can a recruiter.',
          'You don’t need certainty. You need a target that’s good enough to aim at, and a short list of reasons to change it.'
        ] },
        { id: 'l1-musthaves', title: 'Must-haves, nice-to-haves and deal-breakers', minutes: 5, body: [
          'Most people only find out what they need from work after they’ve accepted a job that doesn’t offer it. You can do it in reverse, in ten minutes.',
          '## Three lists',
          '- **Must-haves:** if it’s missing, you’d say no. Lowest pay you’d accept, the most hours you’ll work, and where you’ll work.',
          '- **Nice-to-haves:** they tip a close decision.',
          '- **Deal-breakers:** things that would make you leave within a year, such as a two-hour commute or no flexibility around caring.',
          'Write them down now, while no offer is on the table. They become your filter for every role you look at, and your script when an offer arrives.'
        ] },
        { id: 'l1-compass', title: 'Using the Compass well', minutes: 4, body: [
          'The Compass works best when you answer fast and in your own words. Rough is fine. You can change anything later.',
          '## A few rules',
          '- Don’t pick the “right” values. Pick the ones that make you say “yes, that’s me”.',
          '- Write your North Star as if describing an ordinary week, not a perfect life.',
          '- When it asks for ideas, include your current target role. It’s allowed to win.',
          'When you finish, test the result. Does your top pick still look good against three real ads? If not, that’s useful to know before you apply.'
        ] }
      ],
      tasks: [
        { text: 'Write your target role in one line: “I’m looking for … roles in …”. Add two other roles you’d also be happy with.', minutes: 10 },
        { text: 'Work through the Compass: your values, who you are, your North Star, what you need from work, strengths, choosing, and a plan with first steps.', minutes: 60, tool: 'compass' },
        { text: 'Create your Career Direction Report. It pulls your Compass, your check-in and your notes into one personal document.', minutes: 5, tool: 'report' },
        { text: 'Talk through anything the report surprised you with. Ask Sky to pressure-test your top choice.', minutes: 15, coach: 'career', prompt: 'I’ve done the Compass and read my Career Direction Report. Please pressure-test my top choice: what might I be missing?' },
        { text: 'Book your 60-minute session with Vik for next week, when you have a draft resume to bring.', minutes: 5, tool: 'session' }
      ],
      templates: [
        { title: 'My must-haves', text: 'Role I’m aiming for:\nTwo alternatives:\n\nMust-haves\n- Lowest pay I’d accept: $\n- Most hours a week:\n- Where I’ll work (home, office, location):\n\nDeal-breakers\n-\n-\n\nNice-to-haves\n-\n-' }
      ],
      reflect: 'What did your Compass tell you that you already knew, and what surprised you?',
      tool: 'compass'
    },
    {
      title: 'Sharpen your story',
      goal: 'Turn your experience into a resume, a profile and a short story that make the hiring manager’s decision easy.',
      deliverables: ['A resume tailored to your target role', 'A “Why this role, and why now?” answer', 'An updated LinkedIn profile', 'A prepared brief for your session with Vik'],
      lessons: [
        { id: 'l2-scan', title: 'How a resume is really read', minutes: 5, body: [
          'A recruiter spends seconds on a first scan, and many employers use software to filter applications first. Both are looking for the same thing: proof that you can do this job.',
          '## What that means for your resume',
          '- Use the words from the ad, honestly. If the ad says “stakeholder engagement”, don’t write “stakeholder management”.',
          '- Put the most relevant points first in each role.',
          '- One page of strong evidence beats three pages of duties.',
          'Never claim something you haven’t done. Matching the language is smart. Inventing experience gets found out at the first interview.'
        ] },
        { id: 'l2-evidence', title: 'Evidence beats adjectives', minutes: 5, body: [
          '“Dynamic, results-driven team player” tells a reader nothing. “Led a team of eight and cut late deliveries by 30%” tells them everything.',
          '## The bullet formula',
          'Start with a strong verb, say what you did, and give the result or scope: **Led** a team of 8 to **cut late deliveries by 30%** across 12 sites.',
          'If you don’t have a number, use scope (how many people, how much money, how often) or a before and after. Ask yourself: what changed because I was there?',
          'Gather ten of these from your last two roles before you write anything. The resume then almost writes itself.'
        ] },
        { id: 'l2-gaps', title: 'Gaps, short stints and changes of direction', minutes: 5, body: [
          'Almost everyone has something they’re worried a reader will question: a gap, a short job, a switch of field. You don’t need to hide it. You need to explain it briefly and calmly.',
          '## How',
          '- Say what it was in one line: “Career break to care for family”, “Contract role, 6 months”.',
          '- Say what you gained, if anything: skills, clarity, a qualification.',
          '- Move on to what you can do now.',
          'Be honest and short. A calm sentence reads as confidence. A long defensive paragraph reads as worry.'
        ] }
      ],
      tasks: [
        { text: 'Find three real job ads for your target role. Highlight the words and skills that appear in all three.', minutes: 15 },
        { text: 'Paste your work history and one of the ads into the resume writer. Read every line and fix anything that isn’t true.', minutes: 30, tool: 'resume' },
        { text: 'Write your answer to “Why this role, and why now?”. Use your North Star as the “why”. Ask Sky to tighten it to 60 seconds.', minutes: 20, coach: 'career', prompt: 'Help me write a 60-second answer to “Why this role, and why now?”. Use my North Star from the Compass as the why.' },
        { text: 'Rewrite your LinkedIn headline, About section and experience bullets so they match your resume.', minutes: 25, tool: 'linkedin' },
        { text: 'Fill in your session brief, so Vik can start on the real issues straight away.', minutes: 10, tool: 'brief' },
        { text: 'Have your 60-minute session with Vik if you’ve booked it for this week.', minutes: 60, tool: 'session' }
      ],
      templates: [
        { title: 'Bullet starter', text: '[Strong verb] + [what you did] + [result or scope]\n\nExample: Led a team of 8 to cut late deliveries by 30% across 12 sites.\n\nMy bullets:\n1.\n2.\n3.' },
        { title: 'Why this role, and why now?', text: 'I’m looking for [role] because [what pulls me toward it, from my North Star].\nI’ve spent [time] doing [what], and [proof: one result].\nNow is right because [one honest reason].' }
      ],
      reflect: 'What’s the single strongest piece of evidence in your resume, and is it near the top?'
    },
    {
      title: 'Build your pipeline and apply',
      goal: 'Turn your direction and your story into a steady rhythm of tailored applications and real conversations.',
      deliverables: ['Ten roles found and five chosen', 'Two tailored cover letters', 'Five applications sent', 'Two conversations requested'],
      lessons: [
        { id: 'l3-pipeline', title: 'Five good applications beat fifty', minutes: 5, body: [
          'Mass applying feels productive and mostly isn’t. A tailored application to a role you fit gets far more replies than a generic one, and it costs you about the same energy as ten careless ones.',
          '## A weekly rhythm that works',
          '- Two application slots a week in your calendar, at the same time.',
          '- For each: read the ad, tailor your resume headline and top bullets, write a half-page letter.',
          '- Write down the closing date, and a follow-up date one week later.',
          'Keep a simple tracker: role, organisation, date sent, follow-up date, status. It stops good leads going cold.'
        ] },
        { id: 'l3-network', title: 'Networking without the awkwardness', minutes: 6, body: [
          'Many roles are filled before they’re advertised, and almost every role goes better with someone on the inside who has heard of you.',
          'The trick is to ask for a conversation, not a job. People like talking about their work and are usually generous with 15 minutes.',
          '## How to ask',
          '- Say who you are and why them, in one sentence.',
          '- Ask for 15 minutes about their work, not for a job.',
          '- Offer two time options, and make it easy to say no.',
          'Afterwards send a thank-you the same day, and tell them what you did with their advice. That’s what turns a chat into a contact.'
        ] },
        { id: 'l3-review', title: 'A 20-minute weekly review', minutes: 4, body: [
          'A search without a review turns into a mood. A review turns it into a plan.',
          '## Each Friday, ask',
          '- How many applications did I send, and how many conversations did I have?',
          '- What got a reply, and what didn’t?',
          '- What will I change next week?',
          'Put it in your calendar. If you feel flat, the numbers often show you’ve done more than you thought.'
        ] }
      ],
      tasks: [
        { text: 'Find ten roles worth applying for. Cross off any that break your must-haves from week 1, then pick your best five and note the closing date for each.', minutes: 40 },
        { text: 'Write tailored cover letters for your first two roles with the cover letter writer. Edit them in your own voice.', minutes: 40, tool: 'cover' },
        { text: 'Put two application slots a week in your planner, and add a follow-up date for each application.', minutes: 10, tool: 'planner' },
        { text: 'Send your five applications.', minutes: 60 },
        { text: 'Write outreach messages to two people at organisations you’d like to work for. Ask for a 15-minute conversation, not a job.', minutes: 20, tool: 'outreach' }
      ],
      templates: [
        { title: 'Follow-up email', text: 'Subject: [Role] application, following up\n\nHi [name],\n\nI applied for the [role] on [date] and I’m still very interested. I’ve attached my resume again in case it’s useful. If there’s anything else I can send, I’d be glad to.\n\nThanks for your time,\n[Your name]' },
        { title: 'Application tracker', text: 'Role | Organisation | Sent | Follow up on | Status\n' }
      ],
      reflect: 'Which of your five applications are you proudest of, and what made it better?'
    },
    {
      title: 'Prepare to say yes',
      goal: 'Practise out loud with real examples, and know in advance what a yes looks like.',
      deliverables: ['A bank of five interview stories', 'Two practised mock interviews', 'Your “what makes this a yes” list', 'Your Progress Report and next steps'],
      lessons: [
        { id: 'l4-stories', title: 'Interviews are conversations built from stories', minutes: 6, body: [
          'Most interview questions are the same few questions in different clothes. You don’t need a hundred answers. You need five good stories you can bend to fit.',
          '## The story shape',
          '- **Situation:** where and when, in one sentence.',
          '- **What you did:** your actions, not the team’s.',
          '- **Result:** what changed, with a number if you can.',
          'Pick stories about: a difficult situation, learning something fast, a mistake you fixed, leading or influencing someone, and something you’re proud of. Say them out loud. Written answers sound different from spoken ones.'
        ] },
        { id: 'l4-offer', title: 'What to do when the offer arrives', minutes: 6, body: [
          'An offer is the start of a conversation, not the end of one. Most employers expect you to ask questions, and a calm, prepared request rarely costs you the job.',
          '## Before you answer',
          '- Thank them, and ask for the offer in writing and a day or two to consider it.',
          '- Look at the whole package: pay, super, hours, flexibility, leave, development, start date.',
          '- Compare it with the must-haves you wrote in week 1.',
          'If something’s short, ask once and ask clearly, with a reason. If it’s a yes, say it warmly and make it easy for them to start.'
        ] },
        { id: 'l4-nerves', title: 'Nerves and the first five minutes', minutes: 4, body: [
          'Nerves are normal, and a little adrenaline helps. What hurts is the fear of the fear.',
          '## Before',
          '- Practise the first answer out loud until it flows. A strong start settles the rest.',
          '- Arrive early, or log in ten minutes early to check your link and sound.',
          '## During',
          '- Take a breath before you answer. A two-second pause looks thoughtful.',
          '- It’s fine to say “Let me think about that for a moment”.',
          '- Ask for a question to be repeated if you need to.',
          'Afterwards write down what you’d do again and one thing you’d change.'
        ] }
      ],
      tasks: [
        { text: 'Build your bank of five stories with your interview coach, one at a time.', minutes: 40, coach: 'interview', prompt: 'Help me build five interview stories for the role I’m going for. Start by asking me about a difficult situation I handled.' },
        { text: 'Do two mock interviews out loud, with different questions each time.', minutes: 50, coach: 'interview', prompt: 'Please run a mock interview for my target role. Ask one question at a time, then give me feedback on my answer.' },
        { text: 'Decide what would make an offer a yes. Reread your must-haves and write the three things an offer needs, and one thing that would make you say no.', minutes: 15, coach: 'offer', prompt: 'Help me decide what would make a job offer a yes for me. My must-haves are in my Compass.' },
        { text: 'Create your Progress Report: what you’ve done, what has changed since week 1, and your next 30 days.', minutes: 10, tool: 'progress' },
        { text: 'Do your weekly review: what’s moving, what’s stuck, and what’s next?', minutes: 15, tool: 'planner' }
      ],
      templates: [
        { title: 'Story card', text: 'Question it answers:\nSituation:\nWhat I did:\nResult (with a number if possible):\nWhat I learned:' },
        { title: 'Asking about an offer', text: 'Thank you so much, I’m really pleased to receive the offer. Could you send it in writing? I’d like to look at the full package and come back to you by [day].\n\n(When asking for more:) I’m very keen on the role. Based on [reason], I was hoping for [specific ask]. Is there flexibility there?' }
      ],
      reflect: 'If you had an offer tomorrow, what would you need to hear to say yes?'
    }
  ],

  // ───────────────────────── UNSTICK ─────────────────────────
  unstick: [
    {
      title: 'Find what’s in the way',
      goal: 'Get one thing started, and learn what usually stops you, without judging yourself for it.',
      deliverables: ['One career task started and finished', 'Your “what gets in the way” pattern', 'A first-step card you can reuse', 'A daily time in your calendar'],
      lessons: [
        { id: 'u1-why', title: 'Why starting is hard (and it isn’t willpower)', minutes: 5, body: [
          'When you know what to do and still can’t start, it’s rarely laziness. It’s usually one of four things: the task is too big, you’re afraid of getting it wrong, you’re low on energy, or you’re not sure where to begin.',
          'The useful question isn’t “why can’t I just do it?”. It’s “which of those four is this?”. Each has a different fix.',
          '## The four blockers',
          '- **Too big:** make it smaller until it’s obviously doable.',
          '- **Afraid of getting it wrong:** make the first version deliberately rough.',
          '- **Low energy:** do it at your best time of day, and shrink it further.',
          '- **Don’t know where to start:** write the first physical action.'
        ] },
        { id: 'u1-fifteen', title: 'The 15-minute rule and the first physical action', minutes: 5, body: [
          'A task feels heavy because it’s vague. “Work on my resume” is vague. “Open the document and fix the first section” is a physical action you could start now.',
          '## How to shrink a task',
          '- Ask: what is the very first thing I’d touch or type?',
          '- Make it take 15 minutes or less.',
          '- Give it a day, a time and a place. “At 7:30 tomorrow at the kitchen table.”',
          'Tell yourself you only have to do ten minutes. Most of the time you’ll carry on. If you don’t, ten minutes done still counts.'
        ] },
        { id: 'u1-energy', title: 'Matching tasks to your energy', minutes: 4, body: [
          'You don’t have the same energy all day. Hard thinking tasks suit your best hours, and admin suits your low ones.',
          '## Find your best hour',
          '- For three days, note when you feel sharpest and when you fade.',
          '- Put your small career task in the sharp hour.',
          '- Keep low-energy hours for easy things, like tidying your inbox.',
          'If you’re always tired, make the task smaller, not the day longer.'
        ] }
      ],
      tasks: [
        { text: 'Name the one career task you keep putting off: updating your resume, emailing someone, applying for a role.', minutes: 5 },
        { text: 'Shrink it until it takes 15 minutes or less and write its first physical action. Put it in your planner at a set time.', minutes: 10, tool: 'planner' },
        { text: 'Do it. Afterwards, notice what made starting hard.', minutes: 15 },
        { text: 'Talk through what’s underneath the avoidance, without judgement.', minutes: 15, coach: 'action', prompt: 'I keep putting off a career task. Can we work out what’s really getting in the way?' },
        { text: 'Choose a daily time of 15 minutes and put it in your calendar for the week.', minutes: 5, tool: 'planner' }
      ],
      templates: [
        { title: 'First-step card', text: 'The task:\nThe very first physical action:\nWhen (day, time, place):\nIf I feel like skipping, then I’ll:' }
      ],
      reflect: 'Which of the four blockers shows up most for you, and what helped even a little?'
    },
    {
      title: 'Find your reason',
      goal: 'When the first step feels heavy, it helps to remember what it’s for. This week you connect your goal to what matters to you.',
      deliverables: ['Your Compass: values, North Star and a plan', 'A goal checked against your North Star', 'A “reason card” for hard days', 'Your Career Direction Report', 'Your 1:1 with Vik booked'],
      lessons: [
        { id: 'u2-reason', title: 'Motivation that lasts', minutes: 5, body: [
          'Pressure and guilt work for a day or two. What lasts is a reason that’s yours: something you care about that the task serves.',
          'Research on motivation keeps finding the same thing. People keep going when what they’re doing connects to their own values, when they feel some choice, and when they can see progress.',
          '## What that means for you',
          '- Know your top values, in words you’d use yourself.',
          '- Link the goal to one of them, in one sentence.',
          '- Keep that sentence where you’ll see it on a heavy day.'
        ] },
        { id: 'u2-values', title: 'Values as a compass on heavy days', minutes: 5, body: [
          'Values aren’t slogans. They’re what you’d be proud of at the end of a long week even if nobody saw it.',
          'When you’re stuck, ask: which of my values does this step serve? A small, boring step feels different when it’s serving something you care about.',
          '## An example',
          'A parent who values family and security is updating her resume. The step stays boring, but the reason isn’t: “I’m doing this so there’s more room in our month.”',
          'You’ll write yours this week, from your own answers.'
        ] },
        { id: 'u2-goal', title: 'From a vague goal to a clear one', minutes: 4, body: [
          '“Get a better job” is a wish. A goal says what, roughly when, and how you’ll know.',
          '## A simple test',
          '- **What:** the kind of role, in one line.',
          '- **When:** a date that’s a stretch but not a fantasy.',
          '- **How you’ll know:** an offer, an interview, a first conversation.',
          'Write it, then read it against your North Star. If it doesn’t connect to what matters, change the goal, not your values.'
        ] }
      ],
      tasks: [
        { text: 'Work through the Compass: values, who you are, your North Star, what you need from work, and a plan with first steps.', minutes: 60, tool: 'compass' },
        { text: 'Write your goal in one sentence, like “Get a role as … by …”. Check it against your North Star: does it serve your number one value? Adjust it until it does.', minutes: 15 },
        { text: 'Write your reason card: one sentence you can read on a heavy day.', minutes: 5 },
        { text: 'Create your Career Direction Report, and read it once through.', minutes: 10, tool: 'report' },
        { text: 'Book your 60-minute session with Vik, and fill in your session brief.', minutes: 15, tool: 'session' }
      ],
      templates: [
        { title: 'Reason card', text: 'My goal:\nWhy it matters (my number one value):\nThe sentence I’ll read on a heavy day:\n“I’m doing this so that…”' }
      ],
      reflect: 'What would be different for you in a year if this goal happened?',
      tool: 'compass'
    },
    {
      title: 'Make it small and keep the streak',
      goal: 'Break your goal into pieces you can schedule, and show up for the first one.',
      deliverables: ['Three to five milestones tied to your values', 'Three time blocks done', 'An if–then plan for hard moments', 'A refreshed resume'],
      lessons: [
        { id: 'u3-milestones', title: 'Milestones you can schedule', minutes: 5, body: [
          'Big goals stay vague. Milestones give you something to put in a calendar. A good milestone is something you could finish in a week or two and could tell someone about.',
          '## Examples',
          '- “Resume finished and sent to one trusted person”',
          '- “Five roles shortlisted”',
          '- “Two coffee chats booked”',
          'Put each milestone against one of your values. That’s the reason you’ll reach for when it gets heavy.'
        ] },
        { id: 'u3-slips', title: 'When a block slips', minutes: 5, body: [
          'You’ll miss a block. Everyone does. What matters is what you say to yourself next.',
          'Studies on self-criticism and self-compassion keep finding that people who respond to a slip with kindness are more likely to try again than people who respond with guilt.',
          '## A better question',
          'Don’t ask why you failed. Ask: what got in the way, and what would make it easier next time? Then move the block to another day, rather than skipping it.',
          'The streak is not “never miss”. It’s “come back quickly”.'
        ] },
        { id: 'u3-env', title: 'Make starting the easy path', minutes: 4, body: [
          'Small changes to where and when you work can do more than willpower.',
          '## Ideas',
          '- Keep your resume open on your computer, ready for tomorrow.',
          '- Work in the same place at the same time. Habits attach to places.',
          '- Put your phone in another room for the 25 minutes.',
          '- Lay out what you need the night before.',
          'The goal is to make starting the thing that takes the least effort.'
        ] }
      ],
      tasks: [
        { text: 'Break your goal into three to five milestones. Next to each, write which of your values it serves.', minutes: 20, coach: 'exec', prompt: 'Help me break my career goal into three to five milestones I could finish in a week or two.' },
        { text: 'Book three 30-minute blocks for the first milestone in your planner, and write what you’ll do in each.', minutes: 10, tool: 'planner' },
        { text: 'Add an if–then for the hardest moment: “If I feel like skipping, then I’ll do just 10 minutes.”', minutes: 5 },
        { text: 'Show up to your three blocks, even for 10 minutes. Work in 25-minute stretches with a 5-minute break.', minutes: 90 },
        { text: 'Update your resume with the resume writer, so you have something real to send.', minutes: 30, tool: 'resume' },
        { text: 'If a block slips, talk it through and move it. Don’t skip it.', minutes: 10, coach: 'action', prompt: 'A block slipped this week. Help me work out what got in the way, and how to make it easier.' }
      ],
      templates: [
        { title: 'Weekly review', text: 'What moved this week?\nWhat stuck?\nWhat helped?\nMy next milestone:\nMy three blocks (day, time, what I’ll do):' }
      ],
      reflect: 'What made a block easier to start, and how could you do more of it?'
    },
    {
      title: 'Finish something you can see',
      goal: 'One finished thing builds more confidence than a lot of half-started ones. Finish one, and plan the next month.',
      deliverables: ['One visible thing finished', 'Your wins list', 'Your Progress Report', 'A plan for the next 30 days'],
      lessons: [
        { id: 'u4-finish', title: 'Finishing builds identity', minutes: 5, body: [
          'Each finished thing is evidence about who you are. “I’m someone who finishes what matters” becomes easier to believe when you have proof.',
          'So choose something visible and finishable this week: an updated resume, a refreshed LinkedIn profile, or one application sent. Done is better than perfect.',
          '## Wins count',
          'Write down every win from the month, including the small ones. Our brains keep the failures and lose the evidence.'
        ] },
        { id: 'u4-next', title: 'Your next 30 days', minutes: 5, body: [
          'Momentum fades if you stop at the finish line. Before the month ends, choose your next milestone and book its blocks.',
          '## A simple structure',
          '- One milestone per week.',
          '- Three blocks per milestone, in your calendar.',
          '- One review at the end of each week.',
          'If you’d like another month of support, New Page can continue with a session each month. Only if it would help.'
        ] },
        { id: 'u4-wins', title: 'Counting progress honestly', minutes: 4, body: [
          'When you’re stuck, you tend to remember what you didn’t do. That’s unfair, and it makes starting harder.',
          '## Keep a wins list',
          '- Include small things: opened the document, sent one message, said no to a distraction.',
          '- Date each one.',
          '- Read it before your next block.',
          'Don’t move the goalposts. A win is a win even if there’s more to do.'
        ] }
      ],
      tasks: [
        { text: 'Finish one visible thing: an updated resume, a refreshed LinkedIn profile, or one application sent.', minutes: 60, tool: 'resume' },
        { text: 'Write down your wins from the month, including the small ones. Reread your North Star.', minutes: 15 },
        { text: 'Retake your check-in and see where your dot has moved.', minutes: 5 },
        { text: 'Create your Progress Report: what you did, what changed, and your next steps.', minutes: 10, tool: 'progress' },
        { text: 'Pick your next milestone and book its blocks.', minutes: 10, tool: 'planner' }
      ],
      templates: [
        { title: 'Wins list', text: 'This month I:\n1.\n2.\n3.\n\nSomething I did that I didn’t think I would:\nThe next milestone:' }
      ],
      reflect: 'What would you tell yourself on day one, knowing what you know now?'
    }
  ],

  // ───────────────────────── EXPLORE ─────────────────────────
  explore: [
    {
      title: 'Know yourself',
      goal: 'Direction comes from knowing what matters to you and what you’re good at, more than from searching job ads.',
      deliverables: ['Your top five values, in order', 'A strengths map: know, do, love', 'Two stories from people who know you', 'Time in your calendar for the next two weeks'],
      lessons: [
        { id: 'e1-values', title: 'Values, interests and strengths are different things', minutes: 6, body: [
          'People often mix three different questions when they ask “what should I do?”.',
          '- **Values:** what matters to you in work and life.',
          '- **Interests:** what you’re curious about or enjoy.',
          '- **Strengths:** what you do well, and ideally enjoy doing.',
          'The best directions sit where all three overlap. If you only follow interests, you may choose something you love and can’t earn a living from. If you only follow strengths, you may become very good at something that drains you.',
          'This week is about writing each of the three down, in your own words, before looking at a single job ad.'
        ] },
        { id: 'e1-others', title: 'Ask people who know you', minutes: 5, body: [
          'You’re the worst person to describe your own strengths, because they’re so ordinary to you. People who know you well see them clearly.',
          '## The best-self question',
          'Ask two or three people: “When do you see me at my best?” and “What do people come to me for?”. Write down their exact words. Don’t correct them.',
          'You’ll usually find a pattern you’d never have written yourself.'
        ] },
        { id: 'e1-history', title: 'Your history is raw material', minutes: 5, body: [
          'You already have more skills than you list. Go back over your jobs, study and unpaid work, and write down what you did, not what your title was.',
          '## A quick inventory',
          '- Three things you’re known for.',
          '- Three problems you’ve solved.',
          '- Three things people ask you for help with.',
          'Circle the ones you’d happily do more of. Those are the skills worth building a direction around.'
        ] }
      ],
      tasks: [
        { text: 'Values: circle the ten values that matter most in work, narrow them to your top five, and put those in order.', minutes: 20, coach: 'career', prompt: 'Help me find my top five work values. Ask me about times work felt really good.' },
        { text: 'Strengths: write three things you know, three things you can do well and three things you love doing, even if you’re not paid for them.', minutes: 25 },
        { text: 'Ask two people who know you well: “When do you see me at my best?” Write down what they say, word for word.', minutes: 30, tool: 'outreach' },
        { text: 'Put the next two weeks of this program in your calendar.', minutes: 10, tool: 'planner' },
        { text: 'Talk through anything that surprised you.', minutes: 15, coach: 'career', prompt: 'I’ve written my values, strengths and what two people said about me. What patterns do you see?' }
      ],
      templates: [
        { title: 'Best-self message', text: 'Hi [name], I’m working out what I’d like to do next, and I’d really value your view. When do you see me at my best? And what do people come to me for? A few lines is perfect. Thank you!' },
        { title: 'Strengths map', text: 'Things I know:\n1.\n2.\n3.\n\nThings I can do well:\n1.\n2.\n3.\n\nThings I love doing:\n1.\n2.\n3.' }
      ],
      reflect: 'What did other people see in you that you hadn’t said about yourself?'
    },
    {
      title: 'Generate options',
      goal: 'Most people judge ideas too early. This week is for quantity, not quality.',
      deliverables: ['At least ten career ideas', 'Your ideas scored on energy, fit and realism', 'Your top two ideas', 'A prepared brief for your session with Vik'],
      lessons: [
        { id: 'e2-diverge', title: 'Quantity first', minutes: 5, body: [
          'The first idea you have is rarely the best one, and the idea that feels silly is often a clue. So before you judge anything, produce a lot.',
          '## The rules',
          '- Set a 20-minute timer. Write at least ten roles, industries or ways of working.',
          '- Include a few wild ones.',
          '- Don’t cross anything out. Judging comes later.',
          'Then mix your lists: one thing you know, one thing you do well, one thing you love. See what that combination points to.'
        ] },
        { id: 'e2-score', title: 'Scoring ideas without killing them', minutes: 5, body: [
          'Score each idea out of five on three things: the energy it gives you, how well it fits your values, and how realistic it feels right now.',
          'Realistic is the least important of the three. “Realistic right now” changes. Energy and fit usually don’t.',
          '## When you’re torn',
          'Write what you’d gain and give up with each of your top two. Then notice which one you hope wins. That reaction is information.'
        ] },
        { id: 'e2-constraints', title: 'Preferences are not constraints', minutes: 5, body: [
          'When people say “that’s not realistic”, they often mean “I’d have to change something”. Separate the two.',
          '## Sort your list',
          '- **Real constraints:** things you can’t change right now, like caring for someone or needing a minimum income.',
          '- **Preferences:** things you’d rather keep but could flex, like a short commute.',
          '- **Assumptions:** things you believe but haven’t checked, like “I’m too old for that”.',
          'Test assumptions with a conversation. You’ll often find a path you had ruled out for no good reason.'
        ] }
      ],
      tasks: [
        { text: 'Set a 20-minute timer. Write at least ten roles, industries or ways of working that could use your top values and strengths.', minutes: 20 },
        { text: 'Mix it up: pair one thing you know, one thing you do well and one thing you love, and see what job that points to.', minutes: 20 },
        { text: 'Score each idea from 1 to 5 on energy, fit and realism. Circle your top two.', minutes: 20, coach: 'career', prompt: 'Help me score my career ideas on energy, fit with my values and realism.' },
        { text: 'If you’re torn between two, work through the choice with Sky’s Clarity compass focus.', minutes: 25, coach: 'clarity', prompt: 'I’m torn between two career ideas. Can we work through the decision?' },
        { text: 'Fill in your session brief, so Vik can start on the real questions.', minutes: 10, tool: 'brief' }
      ],
      templates: [
        { title: 'Idea scorecard', text: 'Idea | Energy (1-5) | Fit with values (1-5) | Realistic now (1-5) | Notes\n' }
      ],
      reflect: 'Which idea would you try first if you knew you couldn’t fail?'
    },
    {
      title: 'Bring it together',
      goal: 'You have your values, your strengths and a pile of ideas. This week you put them on one page, work out what you need from work, choose what to test, and plan how.',
      deliverables: ['Your Compass, complete', 'A top choice and a second choice', 'Your Career Direction Report', 'Three experiments in your calendar', 'Your 1:1 with Vik'],
      lessons: [
        { id: 'e3-direction', title: 'From ideas to a direction', minutes: 6, body: [
          'A direction isn’t the answer to “what’s my perfect career?”. It’s “what’s worth testing next?”. You’re choosing an experiment, not a lifetime.',
          '## What helps',
          '- Say your North Star out loud: the picture of your values lived in an ordinary week.',
          '- Put your top ideas beside it. Which of them would support that picture?',
          '- Check your must-haves: pay, hours, stress, and where you work.',
          'The Compass takes you through this in order. Answer in your own words, and let it be rough.'
        ] },
        { id: 'e3-experiments', title: 'Small experiments beat big decisions', minutes: 6, body: [
          'You find out what fits by trying small versions of it, not by thinking harder. A good experiment is cheap, quick and tells you something.',
          '## Three kinds',
          '- **Talk to someone doing it:** a 15 to 20 minute chat about what a normal week looks like.',
          '- **Taste it:** a short course, a webinar, a day of volunteering.',
          '- **Read the market:** five real job ads, noting which tasks excite you and which drain you.',
          'Write down what each one tells you. The question isn’t “did I like it?”, it’s “what gave me energy?”.'
        ] },
        { id: 'e3-taster', title: 'Running a taster well', minutes: 4, body: [
          'A taster only helps if you notice what you feel. Decide before you start what you want to find out.',
          '## Before',
          '- Write two questions: “Do I like the tasks?” and “Do I like the people and setting?”.',
          '## During',
          '- Notice what you lose track of time doing.',
          '- Notice what you’re glad to leave.',
          '## After',
          'Within an hour, write two lines: what gave you energy, and what didn’t. Memory softens quickly.'
        ] }
      ],
      tasks: [
        { text: 'Work through the Compass. Use your answers from weeks 1 and 2 as you go.', minutes: 75, tool: 'compass' },
        { text: 'Create your Career Direction Report and read it through.', minutes: 10, tool: 'report' },
        { text: 'Pick a top choice and a second choice, with one line on why each made the list.', minutes: 15, coach: 'clarity', prompt: 'Help me choose between my top ideas, using my Compass answers.' },
        { text: 'Write outreach messages to two people doing the work you’re curious about, asking for a 20-minute chat.', minutes: 20, tool: 'outreach' },
        { text: 'Plan three experiments, put each in your planner with a date, and do the first one this week.', minutes: 15, tool: 'planner' },
        { text: 'Have your 60-minute session with Vik.', minutes: 60, tool: 'session' }
      ],
      templates: [
        { title: 'Experiment plan', text: 'Idea I’m testing:\nThe experiment (chat, taster or ad review):\nWhen:\nWhat I want to find out:\nWhat gave me energy / what didn’t:' },
        { title: 'Coffee chat request', text: 'Hi [name], I’m exploring a move into [field] and I admire your work at [organisation]. Could I ask you a few questions about what your work is really like? 20 minutes, whatever suits you. Thank you!' }
      ],
      reflect: 'If your North Star were an ordinary Tuesday, what would be in it?',
      tool: 'compass'
    },
    {
      title: 'Test, choose and plan',
      goal: 'Run your experiments, read what they tell you, choose a direction, and make a plan with first steps.',
      deliverables: ['Three experiments done, with notes', 'A direction chosen for now', 'A plan: now, building, making the move', 'Your Progress Report'],
      lessons: [
        { id: 'e4-read', title: 'Reading your results', minutes: 5, body: [
          'After each experiment, write two lines: what gave you energy, and what didn’t. Don’t ask whether you liked it. Ask what you’d want more of.',
          '## Common patterns',
          '- You love the people but not the work.',
          '- You love the work but not the setting.',
          '- It looked good from outside and a normal week was dull.',
          'Each of those is useful. It tells you what to keep and what to leave, even if the specific job isn’t the one.'
        ] },
        { id: 'e4-choose', title: 'Choosing when you can’t be sure', minutes: 5, body: [
          'You’ll never be certain, and waiting for certainty is its own decision. A useful test is whether a choice is reversible.',
          '- **Reversible** (a course, a trial, a part-time role): choose faster, and learn.',
          '- **Hard to reverse** (leaving a stable job, a big move): slow down, test more, and talk to people.',
          'Choose a direction for the next three to six months, not for life. Put a date on when you’ll review it.'
        ] },
        { id: 'e4-pivot', title: 'Telling your story when you change direction', minutes: 5, body: [
          'A change of direction is easier to explain when it sounds like a thread, not a leap.',
          '## The thread',
          '- Name what stays the same: your values, strengths or kind of impact.',
          '- Name what you’ve done to test the new direction: the chats, the course, the taster.',
          '- Say what draws you there, in one sentence.',
          'Example: “I’ve spent ten years helping people through hard moments in nursing. I’m moving into career coaching because the part I love most is the conversation that helps someone decide what’s next.”'
        ] }
      ],
      tasks: [
        { text: 'Finish the experiments you planned. After each, write two lines: what gave you energy, and what didn’t.', minutes: 90 },
        { text: 'Look back over your notes. Which idea gave you the most energy and still fits your values and your North Star?', minutes: 20, coach: 'clarity', prompt: 'Help me read my experiment results and choose a direction for now.' },
        { text: 'Write a simple plan: Now (the next month), Building (3 to 6 months) and Making the move.', minutes: 20 },
        { text: 'Update your resume and LinkedIn for your chosen direction.', minutes: 40, tool: 'resume' },
        { text: 'Create your Progress Report, and retake your check-in. You may well be in Launch.', minutes: 10, tool: 'progress' },
        { text: 'Put your first three steps in your planner with dates.', minutes: 10, tool: 'planner' }
      ],
      templates: [
        { title: 'Decision note', text: 'The direction I’m choosing for the next three months:\nWhy (my values, my North Star, what the experiments told me):\nWhat I’m leaving for now:\nWhen I’ll review this:' }
      ],
      reflect: 'What did your experiments change about what you want?'
    }
  ],

  // ───────────────────────── RECHARGE ─────────────────────────
  recharge: [
    {
      title: 'Steady',
      goal: 'When you’re depleted, everything feels heavier. This week is only about getting steadier.',
      deliverables: ['One small daily reset, kept for seven days', 'A note on what changed', 'A calm space to talk things through'],
      lessons: [
        { id: 'r1-rest', title: 'Rest is part of the work', minutes: 5, body: [
          'When you’re depleted, decisions get harder, small things feel big, and everything looks bleaker than it is. That isn’t a flaw in your thinking. It’s what tired brains do.',
          'So before any career planning, the job is to get a little steadier. It’s not a detour. It’s what makes the next step possible.',
          '## What counts as a reset',
          '- A walk outside, even ten minutes.',
          '- A proper lunch break away from screens.',
          '- Stretching, a bath, or an earlier night.',
          'Pick one. Do it every day for seven days.',
          'If you’ve felt flat, hopeless or exhausted for more than a couple of weeks, please talk to your GP or a counsellor. This program is coaching, not a treatment.'
        ] },
        { id: 'r1-choose', title: 'Choosing a reset you’ll actually do', minutes: 4, body: [
          'The best reset is the one you’ll do on a bad day. That means small, specific and attached to something you already do.',
          '## Make it stick',
          '- Pick the one you’re most likely to do.',
          '- Attach it to a time: “after my first coffee”, “at 1pm”.',
          '- Put it in your calendar, so you’re not relying on willpower.',
          'If you miss a day, you haven’t failed. Pick it up the next day.'
        ] },
        { id: 'r1-basics', title: 'The basics: sleep, movement, light', minutes: 4, body: [
          'You don’t need a wellness overhaul. A few basics tend to help most people feel a bit steadier.',
          '- **Sleep:** a regular bedtime and wake time, even on weekends, and screens away for the last half hour.',
          '- **Movement:** ten minutes of walking, ideally outside in daylight.',
          '- **Food and water:** a proper meal at lunch, and water on your desk.',
          'Pick one. If you’ve been struggling for a while, a GP can check whether something else is going on.'
        ] }
      ],
      tasks: [
        { text: 'Choose one small daily reset that takes 10 minutes or less, and put it in your calendar at the same time each day.', minutes: 10, tool: 'planner' },
        { text: 'Do your reset every day for seven days.', minutes: 70 },
        { text: 'Check in with Sky’s Recovery focus on how you’re really going. No fixing needed.', minutes: 15, coach: 'recovery', prompt: 'I’m tired and a bit flat. Can we talk about how I’m really going?' },
        { text: 'At the end of the week, write one line: what changed, even slightly, on the days you did it?', minutes: 5 }
      ],
      templates: [
        { title: 'My reset', text: 'My daily reset:\nWhen I’ll do it:\nWhat I’ll attach it to:\nIf I miss a day, I’ll:' }
      ],
      reflect: 'What does your body need more of, and less of, right now?'
    },
    {
      title: 'Lighten the load',
      goal: 'It’s hard to think clearly about your next move while you’re carrying everything at once.',
      deliverables: ['Everything on your mind, written down', 'One worry put down for a while', 'One thing dropped, delayed or handed over'],
      lessons: [
        { id: 'r2-dump', title: 'Get it out of your head', minutes: 5, body: [
          'Worries seem bigger in your head than on paper. A brain dump is the simplest way to see what you’re actually carrying.',
          '## How',
          '- Set a timer for ten minutes and write everything down, work and life, in one messy list.',
          '- Don’t organise it. Just get it out.',
          '- Then circle the one career worry that’s taking up the most room.',
          'Often the list is shorter than it felt, and one or two things are doing most of the damage.'
        ] },
        { id: 'r2-ddd', title: 'Drop, delay, delegate', minutes: 5, body: [
          'You can’t do everything, and trying to makes things heavier. For each item on your list, ask which of three it is.',
          '- **Drop:** it doesn’t matter as much as it feels like it does.',
          '- **Delay:** it matters, but not this month. Put a date on it.',
          '- **Delegate:** someone else can do it, or help.',
          'For the career worry, ask: what is the smallest thing that would make it feel lighter? Sending one email, asking one question, or deciding not to decide until next month.'
        ] },
        { id: 'r2-boundaries', title: 'Gentle boundaries at work', minutes: 4, body: [
          'A boundary isn’t a wall. It’s a sentence that protects your energy.',
          '## Small ones to try',
          '- Finish on time two days this week.',
          '- Turn off notifications after you leave.',
          '- Take your lunch break away from your desk.',
          '- Say “I’ll get back to you by tomorrow” instead of “yes” on the spot.',
          'Pick one. If it feels scary, that’s a sign it matters. Start with the smallest.'
        ] }
      ],
      tasks: [
        { text: 'Write down everything that’s weighing on you, work and life, in one messy list. Don’t organise it.', minutes: 15 },
        { text: 'Circle the career worry that takes up the most room, and write the smallest thing that would make it feel lighter.', minutes: 10 },
        { text: 'Talk it through, gently, with Sky’s Reducing the charge focus.', minutes: 20, coach: 'charge', prompt: 'There’s a career worry that feels very heavy. Can we put it down together?' },
        { text: 'Pick one thing on the list to drop, delay or hand to someone else this week, and do it.', minutes: 15 },
        { text: 'Keep your daily reset going.', minutes: 70, tool: 'planner' }
      ],
      templates: [
        { title: 'Drop, delay, delegate', text: 'Drop:\n-\n\nDelay (until when?):\n-\n\nDelegate (to whom?):\n-\n\nThe one thing I’m doing this week:' }
      ],
      reflect: 'What did it feel like to put one thing down?'
    },
    {
      title: 'A gentle look ahead',
      goal: 'Once you’re a bit steadier, you can start noticing what you want, without any pressure to decide.',
      deliverables: ['Moments you felt like yourself', 'A list of what you’d like more of', 'Your 1:1 with Vik booked, for when you’re ready'],
      lessons: [
        { id: 'r3-notice', title: 'Noticing what gives you energy', minutes: 5, body: [
          'You don’t need to decide anything yet. You only need to notice. Over a week, pay attention to when you feel a little more like yourself, at work or outside it.',
          '## What to write',
          '- What you were doing.',
          '- Who was there.',
          '- What made it feel good.',
          'Look at what repeats. Those patterns are clues, not decisions.'
        ] },
        { id: 'r3-signals', title: 'Signals, not decisions', minutes: 4, body: [
          'When you’re tired, big decisions feel urgent and impossible at once. So take decisions off the table for now and collect signals instead.',
          '## The sentence',
          'Finish this three times, quickly, without editing: “I’d like more of…”',
          'Then look at what repeats. That list is the start of next week’s map.',
          'If there’s something you’re worried you should be deciding, write it down and give yourself a date to look at it.'
        ] },
        { id: 'r3-peaks', title: 'Look back at your best days', minutes: 4, body: [
          'You’ve had days at work, or outside it, when you felt capable and alive. They’re data.',
          '## Ask',
          '- What was I doing?',
          '- Who was I with, and who wasn’t there?',
          '- What was the pace like?',
          '- What made it feel like mine?',
          'Don’t worry if it’s not about work. Energy is energy, and it points somewhere.'
        ] }
      ],
      tasks: [
        { text: 'Notice one moment this week when you felt like yourself. Write down what you were doing, who was there and what made it feel good.', minutes: 15 },
        { text: 'Finish this sentence three times, quickly, without editing: “I’d like more of…”', minutes: 5 },
        { text: 'Look at what repeats, and talk it through. It’s a clue, not a decision.', minutes: 20, coach: 'career', prompt: 'Here are some moments I felt like myself. What patterns do you see?' },
        { text: 'Book your 60-minute session with Vik for when you’re ready, and fill in your brief if you’d like.', minutes: 15, tool: 'session' }
      ],
      templates: [
        { title: 'Moments I felt like myself', text: 'Moment 1: what I was doing / who was there / what made it good\nMoment 2:\nMoment 3:\n\nI’d like more of:\n1.\n2.\n3.' }
      ],
      reflect: 'What keeps showing up in the moments you felt like yourself?'
    },
    {
      title: 'Check in and make a gentle map',
      goal: 'See what has shifted, then put what you’ve noticed on one page. It’s a map to hold, not a decision to make.',
      deliverables: ['Your gentle Compass: values, who you are, North Star', 'Your Career Direction Report', 'Where your dot has moved', 'A next small step that fits your energy'],
      lessons: [
        { id: 'r4-map', title: 'A map to hold, not a decision', minutes: 5, body: [
          'This week you put what you’ve noticed on one page. You’re not choosing a career. You’re writing down what matters to you and what you’d want work to leave room for.',
          '## What goes on the map',
          '- Your top five values, in order.',
          '- Three “I am…” statements about the whole of you, not just work.',
          '- A short paragraph picturing your number one value lived in an ordinary week.',
          '- What work would need to be like for you to have energy left over.',
          'Keep it gentle. You can change every word of it.'
        ] },
        { id: 'r4-next', title: 'Choosing a next step that fits your energy', minutes: 5, body: [
          'Many people move toward Explore or Unstick after a few weeks of steadying. Some need longer, and that’s fine.',
          '## A simple guide',
          '- If you feel steadier and curious, try the Explore program.',
          '- If you still feel low on energy, repeat weeks 1 and 2 and be kind to yourself. That’s pacing, not failing.',
          '- If you’ve felt flat or exhausted for more than a few weeks, talk to your GP or a counsellor.',
          'Your session with Vik is a good place to talk about which fits.'
        ] },
        { id: 'r4-experiments', title: 'Small experiments for when you’re ready', minutes: 4, body: [
          'When you feel a bit more energy, resist the urge to decide everything. Try tiny experiments instead.',
          '## Examples',
          '- A 15-minute chat with someone whose work you’re curious about.',
          '- An hour reading about one field.',
          '- Updating one section of your resume.',
          'Keep each one small enough that it doesn’t cost you your reset. If it does, it was too big.'
        ] }
      ],
      tasks: [
        { text: 'Work through the Compass at your own pace: your values, who you are, your North Star, and what you need from work. You can stop after those.', minutes: 45, tool: 'compass' },
        { text: 'Create your Career Direction Report, and read it gently.', minutes: 10, tool: 'report' },
        { text: 'Retake your check-in and see where your dot has moved.', minutes: 5 },
        { text: 'Create your Progress Report, and choose your next small step.', minutes: 10, tool: 'progress' },
        { text: 'Have your 60-minute session with Vik if you haven’t already.', minutes: 60, tool: 'session' }
      ],
      templates: [
        { title: 'My gentle map', text: 'My top five values:\n1.\n2.\n3.\n4.\n5.\n\nThree “I am…” statements:\n1.\n2.\n3.\n\nMy North Star, in a paragraph:\n\nWhat work would need to leave me:' }
      ],
      reflect: 'What would be a kind next step for you right now?',
      tool: 'compass'
    }
  ]
}

// About 170 words a minute, so the label is honest about reading time.
export const readingMinutes = body => Math.max(2, Math.round(body.join(' ').split(/\s+/).length / 170))

// Each lesson above carries a short summary; the full reading lives in program-readings.js.
for (const weeks of Object.values(PROGRAM)) {
  for (const w of weeks) {
    for (const l of w.lessons) {
      const full = READINGS[l.id]
      if (full) { l.body = full.body; l.minutes = readingMinutes(full.body) }
    }
  }
}

export const lessonById = (quadrant, id) => {
  for (const w of PROGRAM[quadrant] || []) {
    const l = w.lessons.find(x => x.id === id)
    if (l) return l
  }
  return null
}
