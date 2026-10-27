// The four 4-week plans. Each plan works on its own, with no New Page tools
// needed: `steps` are complete exercises, and `withNewPage` is one optional
// note per week saying what the paid program adds.
//
// The Compass (values, who you are, North Star, what you need, strengths,
// ideas, choice, plan, first steps) is featured once in every plan, in the
// week where that plan needs a direction: Launch 1, Unstick 2, Explore 3,
// Recharge 4. Weeks before it prepare for it, and weeks after it use it.
// A week with `tool: 'compass'` shows the Compass in the member app.
export const PLANS = {
  recharge: [
    {
      title: 'Steady',
      why: 'When you’re depleted, decisions get harder and everything feels heavier. This week is only about getting steadier.',
      steps: [
        'Choose one small daily reset that takes 10 minutes or less: a walk outside, a proper lunch break away from screens, ten minutes of stretching, or an earlier night. Pick the one you’re most likely to do, and do it every day for seven days.',
        'Put it in your calendar at the same time each day, so you’re not relying on willpower.',
        'At the end of the week, write one line: what changed, even slightly, on the days you did it?'
      ],
      withNewPage: 'The Recovery Coach is a calm space to talk through how you’re really going, and your planner keeps the reset in your calendar with reminders.'
    },
    {
      title: 'Lighten the load',
      why: 'It’s hard to think clearly about your next move while you’re carrying everything at once.',
      steps: [
        'Write down everything that’s weighing on you, work and life, in one messy list. Don’t organise it.',
        'Circle the career worry that takes up the most room. Next to it, write the smallest thing that would make it feel lighter: sending one email, asking one question, or deciding not to decide until next month.',
        'Pick one thing on the list to drop, delay or hand to someone else this week, and do it.'
      ],
      withNewPage: 'Reducing the Charge is a guided conversation for putting down a heavy worry, one step at a time.'
    },
    {
      title: 'A gentle look ahead',
      why: 'Once you’re a bit steadier, you can start noticing what you want, without any pressure to decide. What you notice this week feeds next week’s map.',
      steps: [
        'Notice one moment this week when you felt like yourself, at work or outside it. Write down what you were doing, who was there and what made it feel good.',
        'Finish this sentence three times, quickly, without editing: “I’d like more of…”',
        'Look at what repeats. That’s a clue, not a decision. Keep these notes for next week.'
      ],
      withNewPage: 'Your Career Coach helps you put words to what you notice, and the Recovery Coach is there if it’s a heavy week.'
    },
    {
      title: 'Check in and make a gentle map',
      why: 'See what has shifted, then put what you’ve noticed on one page. It’s a map to hold, not a decision to make.',
      steps: [
        'Retake the quiz at vikashan.com.au/newpage and see where your dot has moved. Many people move toward Explore or Unstick after a few weeks of steadying.',
        'Values and who you are: using last week’s notes, circle the ten values that matter most to you, narrow them to five, and put those in order. Autonomy, Balance, Challenge, Community, Creativity, Fairness, Flexibility, Growth, Helping others, Income, Leadership, Learning, Mastery, Meaning, Recognition, Security, Stability, Teamwork, Variety, Adventure. Then write three “I am…” statements about the whole of you, not just work: “I am a gardener”, “I am a good listener”, “I am someone who needs quiet mornings”.',
        'Your North Star: write a short paragraph picturing your number one value fully lived by your number one “I am”, in an ordinary week. Don’t worry about jobs. Then write what work would need to be like for you to have energy left over: the most hours a week, how much stress is okay, and where you’d like to work.',
        'Choose your next small step. If you feel steadier, try the Explore plan. If you’re still low on energy, repeat weeks 1 and 2 and be kind to yourself. That’s pacing, not failing. If you’ve felt flat or exhausted for more than a few weeks, it’s worth talking to your GP or a counsellor.'
      ],
      withNewPage: 'The Compass takes you through your values, who you are, your North Star and what you need from work, in small pieces at your own pace. It saves to your account, and your coaches know what you find. Your Career Coach helps you choose the next step, and the 1:1 session with Vik is a good place to talk it through.',
      tool: 'compass'
    }
  ],

  explore: [
    {
      title: 'Know yourself',
      why: 'Direction comes from knowing what matters to you and what you’re good at, more than from searching job ads. In week 3 you’ll bring all of it together.',
      steps: [
        'Values: from this list, circle the ten that matter most in work, narrow them to your top five, and put those in order. Autonomy, Balance, Challenge, Community, Creativity, Fairness, Flexibility, Growth, Helping others, Income, Leadership, Learning, Mastery, Meaning, Recognition, Security, Stability, Teamwork, Variety, Adventure.',
        'Strengths: write three things you know (subjects, industries, how things work), three things you can do well (skills people ask you for) and three things you love doing, even if you’re not paid for them.',
        'Ask two people who know you well: “When do you see me at my best?” Write down what they say, word for word.'
      ],
      withNewPage: 'Your Career Coach talks through anything that surprises you, and your planner keeps the two conversations in your calendar.'
    },
    {
      title: 'Generate options',
      why: 'Most people judge ideas too early. This week is for quantity, not quality.',
      steps: [
        'Set a 20-minute timer. Write down at least ten roles, industries or ways of working that could use your top values and strengths. Include a few that feel a bit wild.',
        'Mix it up: pair one thing you know, one thing you do well and one thing you love, and see what job that points to.',
        'Score each idea from 1 to 5 on three things: the energy it gives you, how well it fits your values, and how realistic it feels right now. Circle your top two.',
        'If you’re torn between two, write what you’d gain and give up with each, then notice which one you hope wins.'
      ],
      withNewPage: 'The Clarity Compass coach guides you through a hard choice, and your planner schedules each idea you want to look into.'
    },
    {
      title: 'Bring it together',
      why: 'You have your values, your strengths and a pile of ideas. This week you put them on one page, work out what you need from work, choose what to test, and plan how.',
      steps: [
        'Who you are: write five “I am…” statements about the whole of you, not just work: “I am a good listener”, “I am a parent”, “I am someone who likes making things”. Put them in order of what feels most true today.',
        'Your North Star: write a paragraph picturing your number one value fully lived by your number one “I am”, in an ordinary week. It can be about any part of life, and work is there to support it. Then write what you need from work for your life to work: the lowest pay you’d accept, the most hours a week, how much stress is okay, and where you’d like to work.',
        'Choose what to test: lay your top ideas from week 2 beside your values, your strengths and your North Star. Pick a top choice and a second choice, and write one line on why each made the list.',
        'Plan three small experiments for your top two choices: a 20-minute coffee chat with someone doing the work, a free taster (a short course, a webinar, a day of volunteering), and a close read of five job ads. Put each in your calendar with a date, and do the first one this week.'
      ],
      withNewPage: 'The Compass takes you through all of this in ten short steps: values, who you are, your North Star, what you need, strengths, mixing ideas, choosing, a plan and first steps. You can use your answers from weeks 1 and 2 as you go. It saves to your account, and your coaches know what you find. Your planner schedules each experiment.',
      tool: 'compass'
    },
    {
      title: 'Test, choose and plan',
      why: 'You find out what fits by trying small versions of it, not by thinking harder. Then you choose.',
      steps: [
        'Finish the experiments you planned last week. After each one, write two lines: what gave you energy, and what didn’t.',
        'Look back over your notes. Which idea gave you the most energy and still fits your values and your North Star? That’s your direction for now. It doesn’t have to be forever.',
        'Write a simple plan: Now (what you’ll do in the next month), Building (skills or contacts to build over 3 to 6 months) and Making the move (what the move itself looks like). Put your first three steps in your calendar with dates.',
        'Retake the quiz. You may well be in Launch.'
      ],
      withNewPage: 'Your Career Coach helps you make sense of what you learned and turns your plan into goals and tasks in your planner, and the 1:1 session with Vik is a good place to test your direction.'
    }
  ],

  unstick: [
    {
      title: 'Find what’s in the way',
      why: 'When you know what to do but can’t start, it’s usually not about willpower. Something makes the first step feel heavy. Next week you’ll find what it’s for.',
      steps: [
        'Name the one career task you keep putting off: updating your resume, emailing someone, applying for a role.',
        'Shrink it until it takes 15 minutes or less. Ask: what is the very first physical action? “Open the document and fix the first section” is a first action. “Work on my resume” isn’t. Do it this week, at a set time.',
        'Afterwards, notice what made starting hard. Fear of getting it wrong? Too many steps? Low energy? Not knowing where to begin? Write one line.'
      ],
      withNewPage: 'The Action Coach helps you work out what’s underneath the avoidance, without judgement.'
    },
    {
      title: 'Find your reason',
      why: 'When the first step feels heavy, it helps to remember what it’s for. This week you connect your goal to what matters to you, so it has something pulling you toward it.',
      steps: [
        'Your values: from this list, circle the ten that matter most, narrow them to your top five, and put those in order. Autonomy, Balance, Challenge, Community, Creativity, Fairness, Flexibility, Growth, Helping others, Income, Leadership, Learning, Mastery, Meaning, Recognition, Security, Stability, Teamwork, Variety, Adventure.',
        'Who you are: write three “I am…” statements about the whole of you, not just work: “I am a good listener”, “I am a parent”, “I am someone who finishes what matters”. Put the one that feels most true on top.',
        'Your North Star: write a short paragraph picturing your number one value fully lived by your number one “I am”, in an ordinary week. It can be about any part of life.',
        'Your goal: write it in one sentence, like “Get a role as … by …”, then check it against your North Star. Does it serve your number one value? If not, adjust the goal until it does. This is the reason to come back to when starting feels heavy.'
      ],
      withNewPage: 'The Compass takes you through your values, who you are and your North Star, then helps you choose a direction and plan your first steps. It saves to your account, and your coaches know what you find. The Executive Function Coach helps you get your goal into clear steps.',
      tool: 'compass'
    },
    {
      title: 'Make it small and keep the streak',
      why: 'Big goals stay vague, and momentum matters more than perfect sessions. This week you break your goal into pieces and show up for the first one.',
      steps: [
        'Break your goal into three to five milestones, each something you could finish in a week or two. Next to each, write which of your values it serves.',
        'For the first milestone, book three 30-minute blocks in your calendar this week, and write what you’ll do in each.',
        'Add an “if–then” for the hardest moment: “If I feel like skipping, then I’ll do just 10 minutes.”',
        'Show up to your three blocks, even if you only do 10 minutes. Work in 25-minute stretches with a timer, then take a 5-minute break.',
        'If a block slips, don’t ask why you failed. Ask what got in the way, and what would make it easier next time. Move the block to another day instead of skipping it.'
      ],
      withNewPage: 'The Executive Function Coach helps you break goals down, your planner holds the blocks and emails you a reminder each morning, and the Action Coach is there when a block slips.'
    },
    {
      title: 'Finish something you can see',
      why: 'One finished thing builds more confidence than a lot of half-started ones.',
      steps: [
        'Finish one visible thing this week: an updated resume, a refreshed LinkedIn profile, or one application sent.',
        'Write down your wins from the month, including the small ones. Reread your North Star paragraph, then pick your next milestone and book its blocks.',
        'Retake the quiz and see where you are.'
      ],
      withNewPage: 'The resume writer tailors a resume to a job ad in minutes.'
    }
  ],

  launch: [
    {
      title: 'Confirm your direction',
      why: 'You’re clear and you have energy. Before you spend it on applications, check that the role really fits your life, so the next three weeks are aimed at the right target.',
      steps: [
        'Write your target role in one line: “I’m looking for … roles in …”. Add two other roles you’d also be happy with.',
        'Check it against your life. Circle the ten values that matter most to you, narrow them to five, and put those in order. Autonomy, Balance, Challenge, Community, Creativity, Fairness, Flexibility, Growth, Helping others, Income, Leadership, Learning, Mastery, Meaning, Recognition, Security, Stability, Teamwork, Variety, Adventure. Write three “I am…” statements about the whole of you, not just work. Then write your must-haves: the lowest pay you’d accept, the most hours a week, how much stress is okay, and where you’ll work.',
        'Your North Star: write a short paragraph picturing your number one value fully lived by your number one “I am”. Does your target role fit that picture? If it’s close, keep it. If something’s off, switch to one of your other two roles, or write what you’d change.',
        'Write your plan in three lines: Now (the next month), Building (the next 3 to 6 months) and Making the move. The “Now” line is the rest of this program: your resume, your applications, and getting ready for interviews.'
      ],
      withNewPage: 'The Compass takes you through all of this in ten short steps: values, who you are, your North Star, what you need from work, strengths, choosing, a plan and first steps. It saves to your account, and your coaches know what you find. Your Career Coach can help you pressure-test your choice.',
      tool: 'compass'
    },
    {
      title: 'Sharpen your story',
      why: 'Tailored applications get far more replies than mass ones.',
      steps: [
        'Find three real job ads for your target role. Highlight the words and skills that appear in all three. Those are what screeners look for.',
        'Update your resume so each of those words appears honestly, with a specific example behind it: what you did, and the result.',
        'Write a one-paragraph answer to “Why this role, and why now?” Use your North Star from last week as the “why”. It becomes the base of your cover letters and interview answers.'
      ],
      withNewPage: 'The resume writer tailors your resume to each ad, and your Career Coach helps you sharpen your “why”.'
    },
    {
      title: 'Build your pipeline and apply',
      why: 'A steady rhythm beats bursts of effort, and following up is where many people stop too soon.',
      steps: [
        'Find ten roles worth applying for. Cross off any that break your must-haves from week 1, then pick your best five and note the closing date for each.',
        'For the first two, write a short cover letter, half a page at most: why this role, one example of relevant results, and why this organisation. Put two application slots a week in your calendar.',
        'Send your five applications.',
        'Follow up on any older ones with a short, polite email a week after the closing date. Reach out to two people at organisations you’d like to work for, and ask for a 15-minute conversation about their work, not for a job.'
      ],
      withNewPage: 'The cover letter writer drafts a tailored letter from the job ad and your background, and your planner holds the application slots and tracks what needs a follow-up.'
    },
    {
      title: 'Prepare to say yes',
      why: 'The best preparation is practising out loud, with real examples, and knowing in advance what a yes looks like.',
      steps: [
        'Practise your answers to these five questions out loud, using a real example for each (the situation, what you did, the result): Tell me about yourself. Why this role? Tell me about a time you handled a difficult situation. Tell me about a time you learned something fast. What questions do you have for us?',
        'Decide what would make an offer a yes. Reread your must-haves and your top five values from week 1, and write the three things an offer would need to have, and one thing that would make you say no.',
        'Do your weekly review: what’s moving, what’s stuck, and what’s next?',
        'Retake the quiz.'
      ],
      withNewPage: 'Your Career Coach runs mock interviews, and the 1:1 session with Vik is often used for interview preparation.'
    }
  ]
}
