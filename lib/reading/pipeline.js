// The Career Reading engine.
//
// prepare() does every calculation (no AI): the quiz scores, the five charts
// (each in its own isolated engine), their 30-day forecasts, and the draw,
// which must have been cast before the question was asked.
//
// buildSteps() turns that into the AI steps. Each step is one fresh prompt
// built from calculated data and the person's own answers, never from text
// another step wrote. Stage C steps see one system only. Stage D steps are
// the explicit cross-system layer and get data from every system.
//
// runSteps() runs them with any runner: the Anthropic API, or a file of
// answers keyed by step id (for offline samples and tests).
import { divineReading, isValidSeed } from "./oracle.js";
import { detectCrisis } from "../../reading/shared/safety.js";
import { careerData, parseChartInput } from "./astro.js";
import { scoreQuiz, SITUATIONS, LIKE, WELLBEING } from "../../reading/shared/quiz.js";
import { STYLES, FOCUS, RHYTHM, SIDES, QUADRANTS, justForYou } from "./content.js";
import { traditionalCareer, careerEvents } from "./relevance.js";
import { chartToMarkdown } from "./textchart.js";

export const SYSTEM_ORDER = ["natal", "vedic", "human-design", "gene-keys", "numerology"];
export const POSITION_MEANING = {
  "Who Am I?": "the self in this situation",
  "What's Important?": "what matters most here",
  "What Do I Want?": "the desire underneath",
  "What's In the Way?": "the obstacle",
  "How Do I Show Up?": "how to show up, in mindset or action, to get past what's in the way",
  "What Do I Do?": "the action to take",
  "What's the Next Step?": "the next step",
};
const VOICE = {
  natal: "You are a thoughtful Western astrologer (tropical zodiac, Placidus houses).",
  vedic: "You are a traditional Jyotish (Vedic astrology) guide working in the sidereal zodiac with the Lahiri ayanamsa. Use only Jyotish concepts.",
  "human-design": "You are a Human Design guide. Use only Human Design concepts: type, strategy, authority, profile, centres, channels, gates and lines.",
  "gene-keys": "You are a Gene Keys contemplative guide. Use Gene Keys language: shadow, gift and siddhi, and the Activation, Venus and Pearl sequences.",
  numerology: "You are a thoughtful numerologist working in the Pythagorean system.",
};
const PLAIN = "Write for someone who knows nothing about this system: plain everyday words, short sentences, second person. Name at most one technical term per paragraph, and explain it when you do.";
const CARE = "This is for reflection, not prediction or professional advice. For legal, medical or financial decisions, suggest the person also gets professional advice. Never promise outcomes.";
const NOW_KEYS = { natal: ["personal"], vedic: ["personal"], "human-design": ["personal"], "gene-keys": ["personalTech"], numerology: ["personal"] };

export class ReadingInputError extends Error {}

// Without a birth time, charts are set for midday. What depends on the time is
// left out, and every step for that system is told so.
const TIME_NOTE = {
  natal: "Birth time unknown: this chart is set for midday. The Ascendant, Midheaven and houses depend on the birth time, so they're left out, and the Moon may be up to about 7° away from where it's shown. Don't rely on house placements.",
  vedic: "Birth time unknown: this chart is set for midday. The Lagna, the houses and yogas that depend on them are left out. The Moon's nakshatra may differ, and because the dasha periods are timed from the Moon's exact position, their dates may be off by months or even a few years. Treat dasha timing as approximate and don't rely on house placements.",
  "human-design": "Birth time unknown: this design is set for midday. The Moon's gates may differ, and occasionally another gate or the type can change, so hold the details lightly.",
  "gene-keys": "Birth time unknown: this profile is set for midday. Lines can shift when the Sun is near a line boundary, and Moon-based placements may differ.",
};
function dropTimeSensitive(id, d) {
  const keep = (t, fn) => { const tab = d.tabs.find(x => x.key === t); if (tab) tab.items = tab.items.filter(fn); };
  if (id === "natal" || id === "vedic") d.tabs.forEach(t => t.items.forEach(it => { it.sub = it.sub.replace(/\b\d+(st|nd|rd|th) house\b( · )?/g, "").replace(/ · $/, ""); }));
  const NO_ANGLES = it => !/Ascendant|Midheaven/.test(it.title);
  if (id === "natal") {
    d.tabs = d.tabs.filter(t => t.key !== "houses");
    keep("big3", NO_ANGLES); keep("planets", NO_ANGLES); keep("aspects", NO_ANGLES);
    d.forecast.forEach(day => { day.items = day.items.filter(it => !/Midheaven|Ascendant/.test(it.text)).map(it => ({ ...it, text: it.text.replace(/ \(natal .*?house\)$| \(natal [^)]*\)/, "") })); });
  }
  if (id === "vedic") {
    keep("grahas", it => !/^Lagna/.test(it.title)); keep("nak", it => !/^Lagna/.test(it.title));
    keep("yogas", it => !/Pancha Mahapurusha|Lagna|kendra from the Lagna/i.test(it.title + " " + it.role + " " + it.sub));
    d.forecast.forEach(day => day.items.forEach(it => { it.text = it.text.replace(/your \d+\w\w from Lagna · /, "your "); }));
  }
}

// ── Stage 0 + A + B inputs: all calculation, no AI ───────────────────────────
// input = {person:{birthName, name, date, time, tz, lat, lon, place, timeUnknown?},
//          answers, draw:{seed, castAt}, question:{text, askedAt}}
export function prepare(input) {
  const { person, answers, draw, question } = input || {};
  if (!draw || !isValidSeed(draw.seed) || !draw.castAt) throw new ReadingInputError("the draw must be cast first");
  if (!question || !String(question.text || "").trim() || !question.askedAt) throw new ReadingInputError("missing question");
  if (!(Date.parse(draw.castAt) < Date.parse(question.askedAt))) throw new ReadingInputError("the draw must be cast before the question is asked");

  const quiz = scoreQuiz(answers);
  const reading = divineReading(draw.seed);
  const systems = {};
  const timeUnknown = !!person.timeUnknown;
  for (const id of SYSTEM_ORDER) {
    const inp = parseChartInput({ ...person, ...(timeUnknown ? { time: "12:00" } : {}), system: id });
    const d = careerData(inp, 30);
    if (timeUnknown) dropTimeSensitive(id, d);
    const trad = traditionalCareer(id, d.tabs);
    d.tabs.forEach(t => t.items.forEach((it, i) => { it.career = trad.get(t.key + ":" + i) || null; it.ref = t.key + ":" + i; }));
    systems[id] = {
      ...d,
      chartText: chartToMarkdown(d.chartHTML),
      events: careerEvents(id, d.forecast),
      now: NOW_KEYS[id].map(k => String(d.readingData[k] || "")).filter(Boolean).join("\n"),
      timeNote: timeUnknown ? TIME_NOTE[id] || "" : "",
    };
    delete systems[id].chartHTML;
  }
  const text = String(question.text).trim().slice(0, 1200);
  return {
    person: { name: person.name || "", place: person.place || "", date: person.date, time: person.time, tz: person.tz, timeUnknown: !!person.timeUnknown },
    quiz, draw: { seed: draw.seed, castAt: draw.castAt, reading },
    question: { text, askedAt: question.askedAt, crisis: detectCrisis(text) },
    systems,
    window: { from: systems.numerology.forecast[0].date, to: systems.numerology.forecast.at(-1).date },
  };
}

// ── Data, as text, for prompts ──────────────────────────────────────────────
const cardLine = c => `${c.pos} (${POSITION_MEANING[c.pos]}): ${c.name}`;
const hexLine = r => `Hexagram ${r.pHex} – ${r.pName}` + (r.rHex ? ` → ${r.rHex} – ${r.rName}` : "") + (r.changing.length ? `, changing lines ${r.changing.join(", ")}` : ", no changing lines");
const drawData = r => hexLine(r) + "\nTarot, one card per position:\n" + r.cards.map(c => "- " + cardLine(c)).join("\n");
const itemLine = it => [it.title, it.code, it.sub].filter(Boolean).join(" · ") + (it.role ? ` (${it.role})` : "");
const factCards = S => (S.timeNote ? S.timeNote + "\n" : "") + S.badges.map(b => `${b.name}: ${b.value}`).join("; ") + "\n" +
  S.tabs.flatMap(t => t.items.filter(it => it.career).map(it => "- " + itemLine(it) + " — career: " + it.career)).join("\n");

function compassText(q) {
  const c = q.compass, L = c.leans;
  const lean = (p, a, b) => `${p}: ${L[p].band}` + (L[p].toward ? ` toward ${SIDES[L[p].toward].name}` : ` (${SIDES[a].name} and ${SIDES[b].name} about equally)`);
  return [
    `Code ${c.code}.`,
    lean("energy", "O", "I"), lean("information", "C", "B"), lean("decisions", "L", "V"), lean("structure", "P", "A"),
    "Work Focus: " + c.focus.map(f => FOCUS[f].name + " (" + FOCUS[f].gist + ")").join(" / "),
    "Work Rhythm: " + c.rhythm.map(r => RHYTHM[r].name + " (" + RHYTHM[r].gist + ")").join(" / "),
    "Style(s): " + c.styles.map(s => STYLES[s].name + " — " + STYLES[s].line).join(" / "),
    ...c.flags.map(f => "Flag: " + f.flag + (f.polarity ? " (" + f.polarity + ")" : "")),
  ].join("\n");
}
function whereText(q, withFeelings) {
  const w = q.where;
  return [
    `Quadrant: ${w.quadrant} (clarity ${w.clarity}/16, capacity ${w.capacity}/16; 11 or more is high).`,
    `Situation: ${SITUATIONS[q.situation]}` + (q.satisfied ? `; satisfied with their job: ${LIKE[q.satisfied - 1]}` : "") + ".",
    w.burnout ? "They say they feel burnt out." : "",
    withFeelings && q.safety !== "struggling" ? `Over the last couple of weeks they've been feeling: ${WELLBEING[q.wellbeing]}.` : "",
  ].filter(Boolean).join("\n");
}
const weekBounds = ctx => {
  const days = ctx.systems.numerology.forecast.map(d => d.date);
  return [[0, 7], [7, 14], [14, 21], [21, days.length]].map(([a, b], i) => ({ week: i + 1, from: days[a], to: days[b - 1] }));
};
function allEvents(ctx) {
  return SYSTEM_ORDER.flatMap(id => ctx.systems[id].events.map(e => ({ ...e, system: ctx.systems[id].label })))
    .sort((a, b) => a.date.localeCompare(b.date));
}
const eventLines = evs => evs.map(e => `${e.date} (${e.label}) [${e.system}] ${e.text}`).join("\n");

// ── Steps ───────────────────────────────────────────────────────────────────
const O = props => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const s = { type: "string" };
const A = items => ({ type: "array", items });
const step = (id, stage, model, system, user, schema, meta = {}) => ({ id, stage, model, system, user, schema, ...meta });

export function buildSteps(ctx, opts = {}) {
  const r = ctx.draw.reading, steps = [];

  // A. The draw, before the question. General, then careers in general.
  steps.push(step("draw.iching.general", "A", "main",
    "You are an I Ching oracle. Interpret through the lens of inner transformation. Plain, warm, grounded language.",
    hexLine(r) + ".\nprimary: 2-3 sentences on the primary hexagram.\nlines: 1-2 sentences on the changing lines, or an empty string if there are none.\nresulting: 1-2 sentences on the resulting hexagram, or an empty string if there is none.",
    O({ primary: s, lines: s, resulting: s })));
  r.cards.forEach((c, i) => steps.push(step(`draw.card.${i + 1}.general`, "A", "main",
    "You are a Tarot reader. Use grounded, plain Rider-Waite meanings.",
    `One card from a seven-card spread. You see only this card.\nPosition ${i + 1} of 7: ${cardLine(c)}.\n\ninsight: 2-3 sentences on what this card means in this position.`,
    O({ insight: s }))));
  steps.push(step("draw.iching.career", "A", "main",
    "You are an I Ching oracle reading for work and careers. Plain, warm, grounded language. " + CARE,
    hexLine(r) + ".\nRead this hexagram for work and careers in general: not for any one person or question.\nreading: 3-4 sentences on what it says about work, ambition, timing and the way to act" + (r.rHex ? ", including the movement to the resulting hexagram." : "."),
    O({ reading: s })));
  r.cards.forEach((c, i) => steps.push(step(`draw.card.${i + 1}.career`, "A", "main",
    "You are a Tarot reader working with work and career questions. Use grounded, plain Rider-Waite meanings. " + CARE,
    `One card from a seven-card spread. You see only this card.\nPosition ${i + 1} of 7: ${cardLine(c)}.\n\nRead it for work and careers in general, not for any one person's question.\nreading: 2-3 sentences on what this card in this position says about work, career moves and how to act.`,
    O({ reading: s }))));
  steps.push(step("draw.career", "A", "main",
    "You are an oracle reading an I Ching hexagram and a Tarot spread together, for work and careers. Plain, warm, grounded language. " + CARE,
    "This draw was cast before any question was asked.\n" + drawData(r) + "\n\nRead the whole draw for work and careers in general.\ntheme: the draw's message for work, in at most 12 words.\nreading: 180-250 words: what the draw says about work and career right now, moving through the seven positions as one story, and where the hexagram agrees or adds something.",
    O({ theme: s, reading: s })));

  // B. The question, applied to the draw that was already cast.
  if (!ctx.question.crisis) steps.push(step("draw.question", "B", "main",
    "You are an oracle applying an I Ching hexagram and a Tarot spread to a person's question about their work. Plain, warm, grounded language. " + CARE,
    `The draw was cast at ${ctx.draw.castAt}, before the question was asked at ${ctx.question.askedAt}, so the question could not steer it.\n${drawData(r)}\n\nTheir question: "${ctx.question.text}"\n\n` +
    "cards: for each of the seven positions in order, 2-3 sentences applying that card in that position to their question.\nhexagram: 2-3 sentences applying the hexagram (and its movement, if any) to their question.\nanswer: 150-220 words: what the draw as a whole says about their question, and the one thing it most asks of them.",
    O({ cards: A(O({ pos: s, reading: s })), hexagram: s, answer: s })));

  // C. Each chart on its own: every panel item, each tab overview, the chart's
  // careers reading, and its next 30 days. Nothing outside this system.
  for (const id of SYSTEM_ORDER) {
    const S = ctx.systems[id], sys = VOICE[id] + " " + PLAIN + (S.timeNote ? " " + S.timeNote : "");
    S.tabs.forEach(t => t.items.forEach((it, i) => steps.push(step(`${id}.item.${t.key}.${i}`, "C", it.career ? "main" : "quick", sys,
      `Below is one item from a person's ${S.label} chart, exactly as the chart guide describes it. You see only this item.\n\n---\n${it.prompt}\n---\n\n` +
      `This is for a careers report, so don't write the explanation asked for above. Instead:\ncareer: ${it.career ? "60-90 words" : "one or two sentences, at most 40 words,"} on what this item suggests for their work and career: strengths to use, conditions that suit them, or a trap to watch for.` +
      (opts.fullItems ? "\nexplanation: the explanation asked for above." : ""),
      O(opts.fullItems ? { explanation: s, career: s } : { career: s }), { system: id, ref: it.ref }))));
    S.tabs.filter(t => t.overviewPrompt).forEach(t => steps.push(step(`${id}.overview.${t.key}`, "C", "main", sys,
      t.overviewPrompt + "\n\nReturn JSON.\noverview: the overview asked for above, 150-200 words.\ncareer: 80-120 words on what this part of the chart means for their work and career.",
      O({ overview: s, career: s }), { system: id, tab: t.key })));
    steps.push(step(`${id}.career`, "C", "main", sys + " " + CARE,
      `You are reading one person's ${S.label} chart for their work and career. You see only this chart.\n\nChart signature: ${S.badges.map(b => b.name + ": " + b.value).join("; ")}${S.header ? " (" + S.header + ")" : ""}\n\n` +
      "Every point in the chart, as the chart guide lists it:\n" + S.tabs.map(t => t.name + ":\n" + t.items.map(it => "- " + itemLine(it)).join("\n")).join("\n") +
      "\n\nPoints traditionally read for career, and why:\n" + S.tabs.flatMap(t => t.items.filter(it => it.career).map(it => "- " + it.title + ": " + it.career)).join("\n") +
      "\n\nTiming now, in this system:\n" + (S.now || "none") +
      "\n\nreading: 300-400 words: the work this chart suggests they're built for, how they work best, where work tends to get hard for them, and what the current timing asks of them at work. Point to specific chart points.\n" +
      "highlights: the 3 to 5 points in this chart that matter most for their career, preferring ones that stand out in this chart over the usual ones. For each: title (exactly as listed above), why (40-60 words).",
      O({ reading: s, highlights: A(O({ title: s, why: s })) }), { system: id }));
    steps.push(step(`${id}.month`, "C", "main", sys + " " + CARE,
      `Career-relevant events in one person's ${S.label} chart over the next 30 days (${ctx.window.from} to ${ctx.window.to}). You see only this system.\n\n` +
      (S.events.length ? S.events.map(e => `${e.date} (${e.label}): ${e.text}`).join("\n") : "No career-relevant events in this window.") +
      "\n\nTiming now, in this system:\n" + (S.now || "none") +
      "\n\nreading: 150-220 words on the shape of the month for their work in this system: what builds, what peaks, when to push and when to wait.\ndates: up to 5 dates worth marking, each with a note of at most 20 words. Use dates from the list (YYYY-MM-DD).",
      O({ reading: s, dates: A(O({ date: s, note: s })) }), { system: id }));
  }

  // D. The cross-system layer. Data from every system; never another step's text.
  const facts = SYSTEM_ORDER.map(id => `${ctx.systems[id].label}:\n` + factCards(ctx.systems[id])).join("\n\n");
  const now = SYSTEM_ORDER.map(id => `${ctx.systems[id].label}:\n${ctx.systems[id].now || "none"}`).join("\n\n");
  const SYN = "You are the reader behind a careers report that draws on five independent systems (Natal astrology, Vedic astrology, Human Design, Gene Keys and Numerology), a self-reported work-style quiz, and an I Ching and Tarot draw. Each system was calculated separately. Where they agree, say so; where they differ, say so plainly and help the person hold both. Don't force agreement. Gene Keys and Human Design are calculated from the same planetary gates, and Natal and Vedic astrology from the same planets in different zodiacs, so agreement within either pair is weaker evidence than agreement across them; don't count it twice. " + PLAIN + " " + CARE;
  steps.push(step("profile", "D", "main", SYN,
    "Career-relevant facts from each system, as calculated:\n\n" + facts + "\n\nTheir Work Style Compass result (self-reported):\n" + compassText(ctx.quiz) +
    "\n\nWrite a profile of this person at work.\nsummary: 220-300 words.\nstrengths: 4-6 items: point (one sentence), sources (which systems or the quiz, in plain words).\nsettings: 3-5 settings or conditions where they do their best work, each with sources.\nwatch: 3-4 things to watch for, each with sources.\nagreements: 2-4 places where several systems point the same way.\ntensions: 1-3 places where they differ, and how to hold both.",
    O({ summary: s, strengths: A(O({ point: s, sources: s })), settings: A(O({ point: s, sources: s })), watch: A(O({ point: s, sources: s })), agreements: A(s), tensions: A(s) })));
  steps.push(step("workstyle.lens", "D", "main", SYN,
    "Their Work Style Compass result (self-reported):\n" + compassText(ctx.quiz) + "\n\nWhere they're at (New Page quiz):\n" + whereText(ctx.quiz, false) +
    "\n\nCareer-relevant chart facts:\n\n" + facts + "\n\nTheir draw (cast before any question):\n" + drawData(r) +
    "\n\nreading: 250-350 words: their work style and where they're at, read through their charts and their draw. What the charts confirm, what they add or complicate, and what that means for how they should approach work right now. Treat the quadrant as a place right now, never a label.",
    O({ reading: s })));
  steps.push(step("current", "D", "main", SYN,
    "Where they're at (New Page quiz):\n" + whereText(ctx.quiz, true) + `\n\nTheir question: "${ctx.question.text}"\n\nTiming now in each system:\n\n` + now + "\n\nTheir draw:\n" + drawData(r) +
    "\n\nreading: 250-350 words: where they are now in their working life: what the quiz says, what each system's current timing points to, and what the draw adds. Name the one or two things that matter most right now.\nsignals: one per system (Natal astrology, Vedic astrology, Human Design, Gene Keys, Numerology): system, signal (at most 25 words, plain).",
    O({ reading: s, signals: A(O({ system: s, signal: s })) })));
  const weeks = weekBounds(ctx), evs = allEvents(ctx);
  steps.push(step("month", "D", "main", SYN,
    `Career-relevant timing across all five systems, ${ctx.window.from} to ${ctx.window.to}:\n\n` + eventLines(evs) +
    "\n\nThe four weeks:\n" + weeks.map(w => `Week ${w.week}: ${w.from} to ${w.to}`).join("\n") +
    `\n\nWhere they're at: ${ctx.quiz.where.quadrant}. Their question: "${ctx.question.text}"` +
    "\n\noverview: 120-180 words: the shape of the next 30 days for their work.\nweeks: four items in order: week (1-4), theme (at most 10 words), notes (60-100 words: what the week favours, and what to do with it), dates (up to 4: date YYYY-MM-DD, note at most 20 words, systems).\ntop: the three most important dates of the whole 30 days for their work, in date order (date, note at most 20 words).",
    O({ overview: s, weeks: A(O({ week: { type: "integer" }, theme: s, notes: s, dates: A(O({ date: s, note: s, systems: s })) })), top: A(O({ date: s, note: s })) })));
  if (!ctx.question.crisis) steps.push(step("answer", "D", "main", SYN,
    `Their question: "${ctx.question.text}"\n\nWhere they're at (New Page quiz):\n` + whereText(ctx.quiz, true) + "\n\nTheir work style:\n" + compassText(ctx.quiz) +
    "\n\nTheir draw (cast before the question):\n" + drawData(r) + "\n\nCareer-relevant chart facts:\n\n" + facts + "\n\nTiming now:\n\n" + now +
    "\n\nThe next 30 days, career-relevant:\n" + eventLines(evs) +
    "\n\nAnswer their question.\nshort: at most 70 words: the honest short answer.\ndetailed: 650-900 words in plain paragraphs (you may use up to five short subheadings starting with ### ): the answer, the options as you see them, what the draw says, what the charts say and where they disagree, what their work style and quadrant mean for how to do it, timing in the next 30 days with dates, and one concrete first step.",
    O({ short: s, detailed: s })));
  const Q = QUADRANTS[ctx.quiz.where.quadrant];
  steps.push(step("plan", "D", "main", SYN + " Keep New Page's voice: warm, plain, a little cheeky; small steps over big promises; no hype.",
    `Their New Page plan (${ctx.quiz.where.quadrant}: "${Q.tagline}"). Don't change the steps; you'll add a personal layer under each week.\n\n` +
    Q.weeks.map((w, i) => `Week ${i + 1} · ${w.title} (${weeks[i].from} to ${weeks[i].to})\n` + w.steps.map(x => "- " + x).join("\n")).join("\n\n") +
    "\n\nAlready added for them from their situation:\n" + (justForYou(ctx.quiz).map(x => "- " + x).join("\n") || "- nothing") +
    "\n\nWhere they're at:\n" + whereText(ctx.quiz, true) + `\nTheir question: "${ctx.question.text}"\n\nTheir work style:\n` + compassText(ctx.quiz) +
    "\n\nCareer-relevant chart facts:\n\n" + facts + "\n\nCareer-relevant timing in the next 30 days:\n" + eventLines(evs) +
    "\n\nintro: 60-90 words introducing their plan, in New Page's voice.\nweeks: four items in order: forYou (70-110 words: how to do this week's steps in a way that fits them, drawing on their work style and charts, tied to their question), when (at most 30 words: the best days this week for the main step, with dates, and why).",
    O({ intro: s, weeks: A(O({ forYou: s, when: s })) })));
  return steps;
}

// ── Running ─────────────────────────────────────────────────────────────────
// runner(step) → parsed JSON. Steps are independent, so they run concurrently.
export async function runSteps(steps, runner, { concurrency = 8, onProgress } = {}) {
  const out = {}, queue = [...steps];
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const st = queue.shift();
      try { out[st.id] = await runner(st); }
      catch (err) { out[st.id] = { error: String(err && err.message || err) }; }
      done++;
      onProgress && onProgress({ done, total: steps.length, id: st.id });
    }
  }));
  return out;
}

// An offline runner: answers keyed by step id; missing ones come back marked.
export const answersRunner = answers => async st => answers[st.id] || { pending: true };

// The API runner, using the same models and fallback settings as the oracle.
// Calls the Anthropic Messages API directly (no SDK), like the New Page coach.
// If the key can't use the fast model, its steps fall back to the main model.
export function claudeRunner({ apiKey, model, quickModel, effort = "low", baseUrl = "https://api.anthropic.com", timeoutMs = 150000 } = {}) {
  let quickOk = true;
  const call = async (st, quick) => {
    const res = await fetch(baseUrl.replace(/\/+$/, "") + "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
      body: JSON.stringify({
        model: quick ? quickModel : model,
        max_tokens: quick ? 1000 : 6000,
        fallbacks: "default",
        output_config: { ...(quick ? {} : { effort }), format: { type: "json_schema", schema: st.schema } },
        system: st.system,
        messages: [{ role: "user", content: st.user }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(`Claude API ${res.status}: ${(data.error && data.error.message) || ""}`.trim()); e.status = res.status; throw e; }
    if (data.stop_reason === "refusal") throw new Error("declined");
    return JSON.parse((data.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
  };
  return async st => {
    if (st.model !== "quick" || !quickOk) return call(st, false);
    try { return await call(st, true); }
    catch (err) {
      if (!(err.status === 404 || (err.status === 400 && /model/i.test(err.message)))) throw err;
      quickOk = false;
      console.warn("Fast model unavailable (" + quickModel + "); reading steps use " + model);
      return call(st, false);
    }
  };
}
