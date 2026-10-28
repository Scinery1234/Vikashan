// Fixed reference text for the Career Reading, from the New Page guides:
// the Work Style Compass guide, its career-options companion, and the
// New Page quiz guide (quadrants, 4-week plans, personalisation, safety).
// Kept word for word so the report matches what New Page publishes.

export const SIDES = {
  O: { name: "Outward", gist: "You get your energy from people, conversation and activity.", gives: "Teamwork, meeting new people, busy and lively places.", drains: "Long stretches alone, little contact, everything done in writing." },
  I: { name: "Inward", gist: "You get your energy from quiet, focus and time to think.", gives: "Time to focus, small teams, a chance to get ready before speaking.", drains: "Back-to-back meetings, noisy open-plan spaces, being put on the spot." },
  C: { name: "Concrete", gist: "You trust facts, details and what works right now.", gives: "Clear tasks, hands-on work, real results, methods that are known to work.", drains: "Vague briefs, endless theory, change for the sake of change." },
  B: { name: "Big-picture", gist: "You trust patterns, ideas and what could be.", gives: "New ideas, framing problems, design work, planning for the future.", drains: "Repetitive tasks, heavy detail with no wider purpose." },
  L: { name: "Logic", gist: "You weigh principles, analysis and fairness first.", gives: "Analysis, problem-solving, clear standards, honest debate.", drains: "Places where feelings outweigh facts, or where nobody says what they think." },
  V: { name: "Values", gist: "You weigh people, impact and harmony first.", gives: "Helping and supporting others, purpose-led work, warm teams.", drains: "Cold or conflict-heavy places, or work that clashes with your values." },
  P: { name: "Planned", gist: "You like plans, closure and steady progress.", gives: "Clear goals, steady progress, the chance to finish things properly.", drains: "Constant last-minute changes and unclear priorities." },
  A: { name: "Adaptive", gist: "You like flexibility, options and variety.", gives: "Variety, new situations, freedom to change course.", drains: "Rigid rules, fixed routines and too much paperwork." },
};

export const FOCUS = {
  CL: { name: "Practical Problem-Solver", gist: "You fix, build and organise things so they work reliably." },
  CV: { name: "Hands-on Helper", gist: "You give practical care and support that makes a real difference today." },
  BL: { name: "Systems and Strategy Thinker", gist: "You see how the pieces fit, and design smarter ways to do things." },
  BV: { name: "Possibility and Growth Guide", gist: "You help people and communities grow, and look for meaning in your work." },
};
export const RHYTHM = {
  OP: { name: "Organised Connector", gist: "Team-based work with clear goals, clear roles, and meetings that lead somewhere." },
  OA: { name: "Energetic Adapter", gist: "Fast-moving, varied, people-facing work with room to think on your feet." },
  IP: { name: "Steady Specialist", gist: "Deep-focus work, clear processes, and time to do things properly." },
  IA: { name: "Independent Self-Starter", gist: "Freedom to work your own way, on varied problems, with flexible hours." },
};

const S = (name, type, evidence, line, best, watch, suit, jobs) => ({ name, type, evidence, line, best, watch, suit, jobs });
export const STYLES = {
  "O-C-L-P": S("Team Organiser", "ESTJ", "Data-based", "You turn practical goals into clear plans and bring people along.", "You keep work moving, set clear roles and follow through so things get delivered on time.", "Pushing the pace can leave quieter people behind, and you may under-rate ideas that aren't proven yet.", "Clear goals, defined roles, regular check-ins and visible results.", ["Industrial production manager", "Construction manager", "Sales manager", "Industrial engineer", "Financial manager"]),
  "O-C-L-A": S("Fast Fixer", "ESTP", "Data-based", "You solve real problems on the spot, usually with people around you.", "You stay calm when plans change, work out what's needed and get hands-on with others.", "Routine paperwork and long-term planning can slip, so find a simple system that keeps you on track.", "Varied days, live problems, a team to work with, room to act without waiting for sign-off.", ["Firefighter", "Police officer", "Carpenter", "Securities sales agent", "Construction manager"]),
  "O-C-V-P": S("Dependable Carer", "ESFJ", "Descriptive", "You care for people in practical, organised ways they can count on.", "You notice what people need, make sure it happens and keep things running smoothly.", "You may take on too much for others, so build in time to recover.", "Close teams, clear routines, work that helps someone directly, and a supportive manager.", ["HR specialist", "Registered nurse", "Primary school teacher", "Social worker", "Career counsellor"]),
  "O-C-V-A": S("Warm Responder", "ESFP", "Descriptive", "You get your energy from helping people in the moment.", "You read a room quickly, put people at ease and adapt to whoever walks in the door.", "Back-to-back, emotionally heavy days can wear you down, and admin may pile up.", "Variety, plenty of people contact, flexibility to respond, and colleagues who share the load.", ["Event planner", "Recreation worker", "Real estate agent", "Emergency medical technician", "Customer service"]),
  "I-C-L-P": S("Careful Craftsperson", "ISTJ", "Data-based", "You do precise, dependable work, mostly on your own timetable.", "You get the details right, build reliable processes and are trusted to deliver quality.", "You may wait too long to speak up, or take on more than you let on.", "Quiet focus time, clear standards, well-defined tasks, and a manager who sets priorities then lets you get on.", ["Correctional officer", "Nuclear engineer", "Civil engineer", "Forensic science technician", "Production manager"]),
  "I-C-L-A": S("Hands-on Troubleshooter", "ISTP", "Descriptive", "You like working out how things work, then fixing them your way.", "You learn by doing, adapt quickly and find practical answers other people miss.", "Documentation and handover can get skipped, and a fixed routine can feel like a cage.", "Independence, a mix of problems, a workspace of your own, and few meetings.", ["Electrician", "Automotive technician", "Emergency medical technician", "IT support specialist", "Industrial designer"]),
  "I-C-V-P": S("Steady Supporter", "ISFJ", "Data-based", "You offer calm, reliable care, often one-to-one.", "You listen well, stay consistent and build trust over time.", "You may keep concerns to yourself, so practise saying what you need early.", "Small teams, predictable routines, meaningful one-to-one contact and quiet space between sessions.", ["Registered nurse", "Dental hygienist", "Medical assistant", "Librarian", "Paralegal"]),
  "I-C-V-A": S("Flexible Carer", "ISFP", "Descriptive", "You help people in practical ways, at your own pace and in your own way.", "You're patient and observant, and you adjust to the person in front of you.", "Without some structure, urgent tasks can crowd out important ones.", "Independence, small groups or one-to-one work, varied tasks and flexible hours.", ["Registered nurse", "Dental assistant", "Veterinary technician", "Preschool teacher", "Fashion designer"]),
  "O-B-L-P": S("Strategic Organiser", "ENTJ", "Descriptive", "You see where things could go and build the plan to get there with others.", "You frame the big picture, set direction and keep teams moving towards it.", "You can move faster than the group is ready for, and skip over the people side.", "Clear goals, influence over direction, collaborative planning and regular checkpoints.", ["Chief executive", "Marketing manager", "University business teacher", "Project manager", "Management analyst"]),
  "O-B-L-A": S("Bold Innovator", "ENTP", "Data-based", "You get energised testing new ideas out loud with others.", "You spot openings, pitch persuasively and adapt fast when things change.", "Follow-through can fade once the idea phase ends, so pair up with someone who likes to finish.", "Fast-moving, varied work with lots of conversation and freedom to try things.", ["Architect", "Organisational psychologist", "Industrial engineer", "Aerospace engineer", "PR manager"]),
  "O-B-V-P": S("Community Builder", "ENFJ", "Descriptive", "You bring people together around a purpose and organise things so it happens.", "You inspire others, plan well and keep the human side in view.", "Giving a lot to everyone can leave little for yourself, and you may put conflict off.", "Purpose-led work, collaborative teams, and clear programs with room for people-focused ideas.", ["Speech pathologist", "Training specialist", "Community service manager", "School administrator", "PR manager"]),
  "O-B-V-A": S("Inspiring Catalyst", "ENFP", "Data-based", "You spark ideas and energy in people, and you thrive on change.", "You see potential in people, communicate with passion and adapt as things unfold.", "Lots of starts and few finishes is the risk, so choose what you'll see through.", "Variety, collaboration, creative freedom and work with a cause.", ["Photographer", "Career counsellor", "Producer or director", "Fitness trainer", "Landscape architect"]),
  "I-B-L-P": S("Systems Designer", "INTJ", "Data-based", "You think deeply about how complex things fit together and design clear structures.", "You see patterns, plan carefully and build well-reasoned solutions.", "Perfecting the plan can delay getting started, and others may not see your thinking.", "Long stretches of focus, complex problems, clear goals and thoughtful colleagues.", ["Physicist", "Economist", "Medical scientist", "Epidemiologist", "Software developer"]),
  "I-B-L-A": S("Independent Analyst", "INTP", "Descriptive", "You follow interesting questions wherever they lead, mostly on your own.", "You're curious, original and willing to challenge assumptions.", "Open-ended projects can drift, so set your own checkpoints.", "Freedom over method and hours, intellectual challenge and few meetings.", ["Software developer", "Systems analyst", "Architect", "Operations research analyst", "Management analyst"]),
  "I-B-V-P": S("Reflective Guide", "INFJ", "Data-based", "You help people grow through thoughtful, well-structured support.", "You listen deeply, see the wider picture of a person's situation and plan next steps with care.", "You may carry other people's problems, or hold back your views to keep the peace.", "Small teams, one-to-one or small group work, time to prepare and reflect, and a clear purpose.", ["Mental health counsellor", "Psychologist", "Occupational therapist", "Graphic designer", "Survey researcher"]),
  "I-B-V-A": S("Independent Creator", "INFP", "Data-based", "You follow your values and ideas wherever they lead, in your own way.", "You're imaginative, authentic and good at seeing what matters to people.", "Without structure or deadlines, good ideas can stay on paper.", "Independence, flexible hours, meaningful work and little bureaucracy.", ["Writer", "Fine artist", "Editor", "Interpreter or translator", "Psychologist"]),
};

// ── New Page quadrants and 4-week plans (word for word from the quiz guide) ──
const W = (title, why, steps, optional) => ({ title, why, steps, optional });
export const QUADRANTS = {
  Recharge: {
    tagline: "Rest first, then the next page.",
    where: "Low clarity, low capacity. You're running low on energy and the way forward isn't clear yet.",
    means: "You're running low on energy and the way forward isn't clear yet. That's a really common place to be, and it's not a sign you're doing anything wrong. When you're depleted, pushing for big decisions usually backfires. Rest and steadiness come first. Clarity tends to follow.",
    helps: "Rest, lightening the load, and gentle reflection before any big decisions.",
    first: "Pick one small daily reset that takes 10 minutes or less, like a walk, a proper lunch break or an earlier night, and keep it for seven days.",
    weeks: [
      W("Steady", "When you’re depleted, decisions get harder and everything feels heavier. This week is only about getting steadier.", [
        "Choose one small daily reset that takes 10 minutes or less: a walk outside, a proper lunch break away from screens, ten minutes of stretching, or an earlier night. Pick the one you’re most likely to do, and do it every day for seven days.",
        "Put it in your calendar at the same time each day, so you’re not relying on willpower.",
        "At the end of the week, write one line: what changed, even slightly, on the days you did it?"],
        "The Recovery Coach is a calm space to talk through how you’re really going, and your planner keeps the reset in your calendar with reminders."),
      W("Lighten the load", "It’s hard to think clearly about your next move while you’re carrying everything at once.", [
        "Write down everything that’s weighing on you, work and life, in one messy list. Don’t organise it.",
        "Circle the career worry that takes up the most room. Next to it, write the smallest thing that would make it feel lighter: sending one email, asking one question, or deciding not to decide until next month.",
        "Pick one thing on the list to drop, delay or hand to someone else this week, and do it."],
        "Reducing the Charge is a guided conversation for putting down a heavy worry, one step at a time."),
      W("A gentle look ahead", "Once you’re a bit steadier, you can start noticing what you want, without any pressure to decide.", [
        "Notice one moment this week when you felt like yourself, at work or outside it. Write down what you were doing, who was there and what made it feel good.",
        "Finish this sentence three times, quickly, without editing: “I’d like more of…”",
        "Look at what repeats. That’s a clue, not a decision."],
        "The Compass walks you through your values, strengths and direction in small steps, at your pace."),
      W("Check in", "See what has shifted, and choose a next step that fits your energy.", [
        "Retake the quiz at vikashan.com.au/newpage and see where your dot has moved. Many people move toward Explore or Unstick after a few weeks of steadying.",
        "Choose your next small step. If you feel steadier, try the Explore plan. If you’re still low on energy, repeat weeks 1 and 2 and be kind to yourself. That’s pacing, not failing.",
        "If you’ve felt flat or exhausted for more than a few weeks, it’s worth talking to your GP or a counsellor."],
        "Your Career Coach helps you choose the next step, and the 1:1 session with Vik is a good place to talk it through."),
    ],
  },
  Explore: {
    tagline: "Energy, ideas, and a new page to fill.",
    where: "Low clarity, high capacity. You have energy for a change but no clear direction to point it at.",
    means: "You've got energy to put into a change. What's missing is a clear direction to point it at. That's a good problem to have. The risk is spending that energy on scattered applications or endless research. The next step is getting clear on what you value and what you're good at, then testing a few ideas in the real world.",
    helps: "Clarifying values and strengths, then running small real-world experiments.",
    first: "Write down the five things that matter most to you in work, in order. Then list three things you know, three things you can do well, and three things you love.",
    weeks: [
      W("Know yourself", "Direction comes from knowing what matters to you and what you’re good at, more than from searching job ads.", [
        "Values: from this list, circle the ten that matter most in work, narrow them to your top five, and put those in order. Autonomy, Balance, Challenge, Community, Creativity, Fairness, Flexibility, Growth, Helping others, Income, Leadership, Learning, Mastery, Meaning, Recognition, Security, Stability, Teamwork, Variety, Adventure.",
        "Strengths: write three things you know (subjects, industries, how things work), three things you can do well (skills people ask you for) and three things you love doing, even if you’re not paid for them.",
        "Ask two people who know you well: “When do you see me at my best?” Write down what they say, word for word."],
        "The Compass takes you through your values, who you are, your North Star and what you need from work, and your Career Coach talks through anything that surprises you."),
      W("Generate options", "Most people judge ideas too early. This week is for quantity, not quality.", [
        "Set a 20-minute timer. Write down at least ten roles, industries or ways of working that could use your top values and strengths. Include a few that feel a bit wild.",
        "Mix it up: pair one thing you know, one thing you do well and one thing you love, and see what job that points to.",
        "Score each idea from 1 to 5 on three things: the energy it gives you, how well it fits your values, and how realistic it feels right now. Circle your top two.",
        "If you’re torn between two, write what you’d gain and give up with each, then notice which one you hope wins."],
        "The Compass mixes your strengths into ideas you might not have thought of, and the Clarity Compass guides you through a hard choice."),
      W("Test in the real world", "You find out what fits by trying small versions of it, not by thinking harder.", [
        "Run three small experiments on your top two ideas. Have a 20-minute coffee chat with someone doing the work (ask what a normal week looks like, and what they’d change). Try a free taster: a short course, a webinar or a day of volunteering. Read five job ads closely, and note which tasks excite you and which drain you.",
        "Put each experiment in your calendar with a date.",
        "After each one, write two lines: what gave you energy, and what didn’t."],
        "Your planner schedules each experiment, and your Career Coach helps you make sense of what you learned."),
      W("Choose and plan", "Turn what you’ve learned into a direction and some first steps.", [
        "Look back over your notes. Which idea gave you the most energy and still fits your values? That’s your direction for now. It doesn’t have to be forever.",
        "Write a simple plan: Now (what you’ll do in the next month), Building (skills or contacts to build over 3 to 6 months) and Making the move (what the move itself looks like).",
        "Put your first three steps in your calendar with dates.",
        "Retake the quiz. You may well be in Launch."],
        "Your Career Coach turns your plan into goals and tasks in your planner, and the 1:1 session with Vik is a good place to test your direction."),
    ],
  },
  Unstick: {
    tagline: "One small step, then the next.",
    where: "High clarity, low capacity. You have a fair idea of where you want to go, but getting started feels harder than it should.",
    means: "You have a fair idea of where you want to go, but getting started feels harder than it should. That's not laziness. It's usually a mix of low energy, too many moving parts and something underneath that makes the first step feel heavy. The way through is smaller steps than you think, and some support with what's in the way.",
    helps: "Smaller steps than you think, and support with what's in the way.",
    first: "Name the one career task you keep putting off. Then shrink it until it takes 15 minutes, like \"open my resume and fix the first section\". Do that one thing this week.",
    weeks: [
      W("Find what’s in the way", "When you know what to do but can’t start, it’s usually not about willpower. Something makes the first step feel heavy.", [
        "Name the one career task you keep putting off: updating your resume, emailing someone, applying for a role.",
        "Shrink it until it takes 15 minutes or less. Ask: what is the very first physical action? “Open the document and fix the first section” is a first action. “Work on my resume” isn’t. Do it this week, at a set time.",
        "Afterwards, notice what made starting hard. Fear of getting it wrong? Too many steps? Low energy? Not knowing where to begin? Write one line."],
        "The Action Coach helps you work out what’s underneath the avoidance, without judgement."),
      W("Make it smaller", "Big goals stay vague. Small milestones give you something to schedule.", [
        "Write your goal as one sentence, like “Get a role as … by …”. Break it into three to five milestones, each something you could finish in a week or two.",
        "For the first milestone, book three 30-minute blocks in your calendar this week, and write what you’ll do in each.",
        "Add an “if–then” for the hardest moment: “If I feel like skipping, then I’ll do just 10 minutes.”"],
        "The Executive Function Coach helps you break goals down, and your planner holds the blocks, with reminders."),
      W("Keep the streak", "Momentum matters more than perfect sessions.", [
        "Show up to your three blocks, even if you only do 10 minutes. Showing up is what counts.",
        "Work in 25-minute stretches with a timer, then take a 5-minute break.",
        "If a block slips, don’t ask why you failed. Ask what got in the way, and what would make it easier next time. Move the block to another day instead of skipping it."],
        "The planner has a built-in focus timer, and the Action Coach is there when a block slips."),
      W("Finish something you can see", "One finished thing builds more confidence than a lot of half-started ones.", [
        "Finish one visible thing this week: an updated resume, a refreshed LinkedIn profile, or one application sent.",
        "Write down your wins from the month, including the small ones. Then pick your next milestone and book its blocks.",
        "Retake the quiz and see where you are."],
        "The Resume Generator tailors a resume to a job ad in minutes."),
    ],
  },
  Launch: {
    tagline: "Ready to turn the page.",
    where: "High clarity, high capacity. You know where you're heading and have the energy to go for it.",
    means: "You know where you're heading and you've got the energy to go for it. Now it's about doing it well: applications that are tailored, not sprayed, a steady weekly rhythm, and good preparation for interviews. A system beats bursts of effort.",
    helps: "A clear target, tailored applications and a weekly routine.",
    first: "Choose your target role in one line, then find three real job ads for it. Highlight the words that come up in all three. Those are what your resume needs to show.",
    weeks: [
      W("Sharpen your story", "Tailored applications get far more replies than mass ones.", [
        "Write your target role in one line: “I’m looking for … roles in …”.",
        "Find three real job ads for it. Highlight the words and skills that appear in all three. Those are what screeners look for.",
        "Update your resume so each of those words appears honestly, with a specific example behind it: what you did, and the result.",
        "Write a one-paragraph answer to “Why this role, and why now?” It becomes the base of your cover letters and interview answers."],
        "The Resume Generator tailors your resume to each ad, and your Career Coach helps you sharpen your “why”."),
      W("Build your pipeline", "A steady rhythm beats bursts of effort.", [
        "Find ten roles worth applying for and pick your best five. Note the closing date for each.",
        "For the first two, write a short cover letter, half a page at most: why this role, one example of relevant results, and why this organisation.",
        "Put two application slots a week in your calendar."],
        "The Cover Letter Generator drafts a tailored letter from the job ad and your background, and your planner holds the application slots."),
      W("Apply and follow up", "Applying is only half of it. Following up is where many people stop too soon.", [
        "Send your five applications.",
        "Follow up on any older ones with a short, polite email a week after the closing date.",
        "Reach out to two people at organisations you’d like to work for. Ask for a 15-minute conversation about their work, not for a job."],
        "Your planner tracks what’s been sent and what needs a follow-up."),
      W("Prepare to say yes", "The best preparation is practising out loud, with real examples.", [
        "Practise your answers to these five questions out loud, using a real example for each (the situation, what you did, the result): Tell me about yourself. Why this role? Tell me about a time you handled a difficult situation. Tell me about a time you learned something fast. What questions do you have for us?",
        "Do your weekly review: what’s moving, what’s stuck, and what’s next?",
        "Retake the quiz."],
        "Your Career Coach runs mock interviews, and the 1:1 session with Vik is often used for interview preparation."),
    ],
  },
};

// "Just for you" tweaks from the situation answers (quiz guide 7.1).
export function justForYou(score) {
  const out = [];
  const s = score.situation, sat = score.satisfied;
  if (s === 0 && sat != null && sat <= 2) out.push("Size the steps for evenings and weekends. And ask yourself: what would need to change in your current job for you to stay?");
  if (s === 0 && sat != null && sat >= 3) out.push("Look for growth where you are first (a promotion, a new project, shaping the role) before looking elsewhere.");
  if (s === 1) out.push("In week one, set a simple daily routine to give the day some structure, and check what income support is available to you.");
  if (s === 2) out.push("In week one, list the skills you gained during your break, and write a short, confident line for your resume about the gap.");
  if (s === 3) out.push("List your transferable skills, and book one informational interview with someone already in the field.");
  if (s === 4) out.push("Where the plan says \"apply\", build experience instead: volunteering, projects or an internship.");
  if (score.where.burnout) out.push("Put rest first and keep every step small. If it's been going on for weeks, it's worth talking to your GP or a counsellor.");
  return out;
}

export const SAFETY_LINES = {
  low: "You mentioned you've been feeling low. Go easy on yourself with this plan, and if things get heavier, Lifeline is there on 13 11 14, any time.",
  struggling: "Your career can wait. Talking to someone today matters more. Lifeline 13 11 14 (24/7) · Beyond Blue 1300 22 4636 · 13YARN 13 92 76 · Emergency 000.",
};
export const FOOTER = "Coaching, not therapy. For people 18 and over. In crisis? Call Lifeline on 13 11 14, any time. In an emergency, call 000. This reading is for reflection: it isn't a prediction or professional advice, and AI can be wrong.";
