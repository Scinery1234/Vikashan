// Career Reading engine (reading.vikashan.org): scoring, the order of the cast, and what each
// step may and may not see.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreQuiz, QuizError } from "../reading/shared/quiz.js";
import { prepare, buildSteps, runSteps, answersRunner, ReadingInputError, SYSTEM_ORDER } from "../lib/reading/pipeline.js";
import { renderMarkdown } from "../lib/reading/render.js";
import { chartToMarkdown } from "../lib/reading/textchart.js";

const sample = JSON.parse(fs.readFileSync(new URL("./fixtures/reading-input.json", import.meta.url)));

test("quiz: New Page quadrant, dot and burnout flag", () => {
  const s = scoreQuiz(sample.answers);
  assert.equal(s.where.clarity, 12);
  assert.equal(s.where.capacity, 9);            // statement 4 is reversed: "mostly like me" scores 2
  assert.equal(s.where.quadrant, "Unstick");
  assert.equal(s.where.burnout, true);
  assert.deepEqual(s.where.dot, { x: 0.417, y: 0.667 });
  const launch = scoreQuiz({ ...sample.answers, statements: [4, 4, 4, 1, 4, 4, 4, 4] });
  assert.equal(launch.where.quadrant, "Launch");
  assert.equal(launch.where.burnout, false);
});

test("quiz: Compass leans, bands, flexible code and both matching styles", () => {
  const c = scoreQuiz(sample.answers).compass;
  assert.equal(c.code, "I-B-L/V-A");
  assert.equal(c.leans.energy.band, "Clear lean");
  assert.equal(c.leans.decisions.band, "Flexible");
  assert.equal(c.leans.structure.band, "Slight lean");
  assert.deepEqual(c.styles, ["I-B-L-A", "I-B-V-A"]);
  const allMid = scoreQuiz({ ...sample.answers, compass: Object.fromEntries(Object.keys(sample.answers.compass).map(k => [k, 0])) }).compass;
  assert.equal(allMid.code, "O/I-C/B-L/V-P/A");
  assert.equal(allMid.styles.length, 16);
  assert.ok(allMid.flags.some(f => f.flag === "Lots of middle answers"));
});

test("quiz: bad answers are rejected; satisfaction only when it was asked", () => {
  assert.throws(() => scoreQuiz({ ...sample.answers, statements: [1, 2, 3] }), QuizError);
  assert.throws(() => scoreQuiz({ ...sample.answers, compass: { ...sample.answers.compass, e1: 3 } }), QuizError);
  assert.throws(() => scoreQuiz({ ...sample.answers, satisfied: undefined }), QuizError);
  assert.equal(scoreQuiz({ ...sample.answers, situation: 1, satisfied: undefined }).satisfied, null);
  assert.equal(scoreQuiz({ ...sample.answers, wellbeing: 4 }).safety, "struggling");
});

test("the draw must be cast before the question is asked", () => {
  assert.throws(() => prepare({ ...sample, question: { ...sample.question, askedAt: sample.draw.castAt } }), ReadingInputError);
  assert.throws(() => prepare({ ...sample, draw: { castAt: sample.draw.castAt } }), ReadingInputError);
});

const ctx = prepare(sample);
const steps = buildSteps(ctx);

test("every step has a unique id and a JSON schema", () => {
  assert.equal(new Set(steps.map(s => s.id)).size, steps.length);
  assert.ok(steps.every(s => s.schema && s.schema.type === "object"));
  const items = SYSTEM_ORDER.reduce((a, id) => a + ctx.systems[id].tabs.reduce((b, t) => b + t.items.length, 0), 0);
  assert.equal(steps.filter(s => /\.item\./.test(s.id)).length, items);
});

test("chart steps see one system only: no quiz, question, draw or other system", () => {
  const q = ctx.question.text.slice(0, 40), cards = ctx.draw.reading.cards.map(c => c.name);
  const OWN = { natal: /Placidus|tropical/i, vedic: /Jyotish|nakshatra|dasha/i, "human-design": /Human Design|Projector|bodygraph/i, "gene-keys": /Gene Key|Venus Sequence/i, numerology: /numerolog|Pythagorean|Life Path/i };
  for (const st of steps.filter(s => s.stage === "C")) {
    const text = st.system + "\n" + st.user;
    assert.ok(!text.includes(q), st.id + " sees the question");
    assert.ok(!/Unstick|Work Style Compass|Independent Analyst/.test(text), st.id + " sees the quiz");
    for (const c of cards) assert.ok(!new RegExp("\\b" + c + "\\b").test(text), st.id + " sees the card " + c);
    for (const [other, re] of Object.entries(OWN)) if (other !== st.systemId && other !== stepSystem(st)) assert.ok(!re.test(text), `${st.id} mentions ${re} (${other})`);
  }
});
const stepSystem = st => SYSTEM_ORDER.find(id => st.id.startsWith(id + "."));

test("draw steps before the question never see it; no prompt contains the birth name", () => {
  for (const st of steps.filter(s => s.stage === "A")) assert.ok(!st.user.includes(ctx.question.text.slice(0, 30)), st.id);
  for (const st of steps) assert.ok(!/Elise/.test(st.system + st.user), st.id + " contains the birth name");
});

test("the report renders every section from the step outputs, and marks missing ones", async () => {
  const empty = renderMarkdown(ctx, await runSteps(steps, answersRunner({})));
  assert.match(empty, /Not generated yet: `answer`/);
  for (const h of ["## At a glance", "## 3. The draw", "## 5. Natal astrology", "## 9. Numerology", "## 10. Profile of you", "## 12. The next 30 days", "## 14. Your tailored 4-week plan: Unstick"]) assert.ok(empty.includes(h), h);
  assert.match(empty, /Optional, with New Page/);
  const struggling = prepare({ ...sample, answers: { ...sample.answers, wellbeing: 4 } });
  const md = renderMarkdown(struggling, {});
  assert.doesNotMatch(md, /Optional, with New Page/);
  assert.match(md, /Lifeline 13 11 14/);
});

test("chart text keeps tables and drops scripts in attributes", () => {
  const md = chartToMarkdown(`<button onclick="a.forEach(b=>b.x)">View</button><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2 | 3</td></tr></table><svg><text>x</text></svg>`);
  assert.equal(md, "| A | B |\n|---|---|\n| 1 | 2 \\| 3 |");
});
