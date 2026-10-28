// The Career Reading quiz: a Work Style Compass short form (12 paired
// statements) and the New Page "where are you at" questions (8 statements,
// situation, satisfaction, wellbeing). Scored on the server only.

// ── Work Style Compass, short form ──────────────────────────────────────────
// Each statement pair: `left` and `right` are the two sides, `l`/`r` the
// letter each side counts toward. Eight pairs are the published guide's
// examples; four (marked new) were written for this short form so each
// polarity has both sides on the left at least once.
export const COMPASS = [
  { id: "e1", pol: "energy", l: "O", r: "I", left: "I think best by talking ideas through with others.", right: "I think best by mulling things over on my own first." },
  { id: "i1", pol: "information", l: "C", r: "B", left: "I trust methods that have been tested and shown to work.", right: "I'm drawn to new ways of doing things, even if they're untested." },
  { id: "d1", pol: "decisions", l: "L", r: "V", left: "When making a decision, I weigh up the pros and cons first.", right: "When making a decision, I think first about how it will affect the people involved." },
  { id: "s1", pol: "structure", l: "P", r: "A", left: "I like to have a plan before I start.", right: "I like to start and work it out as I go." },
  { id: "e2", pol: "energy", l: "I", r: "O", left: "After a full day of meetings, I need quiet time to recharge.", right: "After a full day of meetings, I often feel buzzing and ready for more." },
  { id: "i2", pol: "information", l: "C", r: "B", left: "I learn best by doing it, or by seeing it done.", right: "I learn best by understanding the idea behind it." },
  { id: "d2", pol: "decisions", l: "V", r: "L", left: "In a disagreement, I focus on keeping the relationship strong.", right: "In a disagreement, I focus on finding the right answer." },
  { id: "s2", pol: "structure", l: "P", r: "A", left: "I like knowing what my week will look like in advance.", right: "I like it when my week brings surprises." },
  { id: "e3", pol: "energy", l: "I", r: "O", new: true, left: "In a new job, I'd rather get to know a few people well, slowly.", right: "In a new job, I'd rather meet as many people as I can in the first week." },
  { id: "i3", pol: "information", l: "B", r: "C", new: true, left: "I'm drawn to what could be, and where things are heading.", right: "I'm drawn to what's in front of me, and making it work well." },
  { id: "d3", pol: "decisions", l: "V", r: "L", new: true, left: "I'd rather hear feedback kindly, even if it takes longer to get to the point.", right: "I'd rather hear feedback straight, even if it stings." },
  { id: "s3", pol: "structure", l: "A", r: "P", new: true, left: "I often do my best work close to a deadline.", right: "I like to finish well ahead of a deadline." },
];
// Answers run −2 (left is very like me) … 0 (both, or it depends) … +2 (right is very like me).
export const COMPASS_SCALE = ["Left is very like me", "Left is a bit like me", "Both, or it depends", "Right is a bit like me", "Right is very like me"];

export const POLARITIES = {
  energy: { name: "Energy", q: "Where do you get your energy at work?", a: "O", b: "I" },
  information: { name: "Information", q: "What kind of information do you trust and enjoy?", a: "C", b: "B" },
  decisions: { name: "Decisions", q: "What do you weigh first when you decide?", a: "L", b: "V" },
  structure: { name: "Structure", q: "How do you like to organise your work?", a: "P", b: "A" },
};
const ORDER = ["energy", "information", "decisions", "structure"];

// ── New Page: where are you at ──────────────────────────────────────────────
export const STATEMENTS = [
  { id: 1, text: "I can describe the kind of work I want next in one sentence.", axis: "clarity" },
  { id: 2, text: "I have some energy left at the end of most days.", axis: "capacity" },
  { id: 3, text: "I know what matters most to me in a job.", axis: "clarity" },
  { id: 4, text: "I feel burnt out, at work or in life.", axis: "capacity", reverse: true },
  { id: 5, text: "I feel a sense of purpose in life.", axis: "clarity" },
  { id: 6, text: "When I decide to do something, I usually get started.", axis: "capacity" },
  { id: 7, text: "I'm clear on my next steps.", axis: "clarity" },
  { id: 8, text: "Thinking about my career feels more hopeful than heavy.", axis: "capacity" },
];
export const LIKE = ["Not like me", "A little like me", "Mostly like me", "Very like me"];
export const SITUATIONS = ["I'm employed or earning an income", "Between jobs", "Coming back after a break", "Wanting to change careers", "Studying or early in my career", "Something else"];
export const WELLBEING = ["Really good", "Mostly good", "Up and down", "Mostly low", "I'm really struggling"];
export const asksSatisfaction = situation => situation === 0 || situation === 3;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export class QuizError extends Error {}

// Validates and scores the answers. `a` = {compass: {e1: -2..2, …}, statements: [1..4 ×8],
// situation: 0..5, satisfied?: 1..4, wellbeing: 0..4}.
export function scoreQuiz(a) {
  if (!a || typeof a !== "object") throw new QuizError("missing answers");
  const compass = {};
  for (const q of COMPASS) {
    const v = a.compass && a.compass[q.id];
    if (!int(v, -2, 2)) throw new QuizError("compass " + q.id);
    compass[q.id] = v;
  }
  const st = a.statements;
  if (!Array.isArray(st) || st.length !== 8 || !st.every(v => int(v, 1, 4))) throw new QuizError("statements");
  if (!int(a.situation, 0, SITUATIONS.length - 1)) throw new QuizError("situation");
  if (asksSatisfaction(a.situation) && !int(a.satisfied, 1, 4)) throw new QuizError("satisfied");
  if (!int(a.wellbeing, 0, WELLBEING.length - 1)) throw new QuizError("wellbeing");

  return {
    compass: scoreCompass(compass),
    where: scoreWhere(st),
    situation: a.situation,
    satisfied: asksSatisfaction(a.situation) ? a.satisfied : null,
    wellbeing: a.wellbeing,
    safety: a.wellbeing === 4 ? "struggling" : a.wellbeing === 3 ? "low" : "ok",
  };
}

function scoreWhere(st) {
  const pts = st.map((v, i) => (STATEMENTS[i].reverse ? 5 - v : v));
  const clarity = pts[0] + pts[2] + pts[4] + pts[6];
  const capacity = pts[1] + pts[3] + pts[5] + pts[7];
  const hiC = clarity >= 11, hiK = capacity >= 11;
  const quadrant = hiC ? (hiK ? "Launch" : "Unstick") : (hiK ? "Explore" : "Recharge");
  return {
    clarity, capacity, quadrant,
    dot: { x: +((capacity - 4) / 12).toFixed(3), y: +((clarity - 4) / 12).toFixed(3) },
    burnout: st[3] >= 3,
  };
}

const MAX = 6;   // three statements × 2 points
const band = s => (s / MAX < 0.2 ? "Flexible" : s / MAX < 0.45 ? "Slight lean" : s / MAX < 0.75 ? "Clear lean" : "Strong lean");

function scoreCompass(ans) {
  const leans = {}, flags = [];
  let middles = 0;
  for (const pol of ORDER) {
    const P = POLARITIES[pol], pts = { [P.a]: 0, [P.b]: 0 };
    let mid = 0, veryA = 0, veryB = 0;
    COMPASS.filter(q => q.pol === pol).forEach(q => {
      const v = ans[q.id];
      if (v === 0) { mid++; return; }
      const side = v < 0 ? q.l : q.r;
      pts[side] += Math.abs(v);
      if (Math.abs(v) === 2) side === P.a ? veryA++ : veryB++;
    });
    middles += mid;
    const strength = Math.abs(pts[P.a] - pts[P.b]);
    const b = band(strength);
    const toward = pts[P.a] === pts[P.b] ? null : pts[P.a] > pts[P.b] ? P.a : P.b;
    const letter = b === "Flexible" || !toward ? P.a + "/" + P.b : toward;
    // Position on the slider: 0 = fully side a, 1 = fully side b.
    const pos = 0.5 + (pts[P.b] - pts[P.a]) / (2 * MAX);
    leans[pol] = { letter, toward: b === "Flexible" ? null : toward, strength, band: b, percent: Math.round(50 + (50 / MAX) * strength), pos: +pos.toFixed(3), points: pts };
    if (mid >= 2) flags.push({ flag: "It depends", polarity: P.name, text: "The setting really matters for you here. Notice which places bring out each side." });
    if (veryA >= 1 && veryB >= 1) flags.push({ flag: "Two sides", polarity: P.name, text: "Strong signs of both. You may have built one side for work or study. Which feels more like you?" });
  }
  if (middles >= 5) flags.push({ flag: "Lots of middle answers", polarity: null, text: "Try again while picturing one job or study setting, or talk it through with a career counsellor." });
  const code = ORDER.map(p => leans[p].letter).join("-");
  return { leans, code, flags, ...describeStyle(leans) };
}

// Work Focus = Information + Decisions; Work Rhythm = Energy + Structure.
// A flexible polarity opens both options, so a result can match several styles.
function opts(l) { return l.includes("/") ? l.split("/") : [l]; }
function describeStyle(leans) {
  const E = opts(leans.energy.letter), I = opts(leans.information.letter), D = opts(leans.decisions.letter), S = opts(leans.structure.letter);
  const focus = I.flatMap(i => D.map(d => i + d)), rhythm = E.flatMap(e => S.map(s => e + s));
  const styles = rhythm.flatMap(r => focus.map(f => [r[0], f[0], f[1], r[1]].join("-")));
  return { focus, rhythm, styles };
}
