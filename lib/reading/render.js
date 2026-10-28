// Renders a prepared reading and its step outputs as one Markdown document.
// Assembly only: no AI here, and nothing is invented. A step that hasn't run
// shows as pending.
import { SITUATIONS, LIKE, WELLBEING, POLARITIES } from "../../reading/shared/quiz.js";
import { STYLES, FOCUS, RHYTHM, SIDES, QUADRANTS, justForYou, SAFETY_LINES, FOOTER } from "./content.js";
import { SYSTEM_ORDER, POSITION_MEANING } from "./pipeline.js";

const TRAD = "▲";   // traditionally read for career
const PERS = "●";   // stands out in this chart

// `missing`: what a reader sees where a step has no output (default: the step id, for development).
export function renderMarkdown(ctx, out, { generatedAt = new Date().toISOString(), missing = null } = {}) {
  const get = (id, key) => { const o = out[id]; if (!o || o.pending || o.error) return null; return key ? o[key] : o; };
  const or = (v, id) => (v == null || v === "" ? (missing ? `_${missing}_` : `_[Not generated yet: \`${id}\`]_`) : v);
  const q = ctx.quiz, w = q.where, Q = QUADRANTS[w.quadrant], r = ctx.draw.reading;
  const struggling = q.safety === "struggling";
  const who = ctx.person.name || "you";
  const L = [];
  const p = (...xs) => xs.forEach(x => { if (x != null && x !== "") L.push(x, ""); });

  // ── Cover ──
  p(`# Your Career Reading`, `**For ${ctx.person.name || "you"}** · prepared ${generatedAt.slice(0, 10)}`,
    `> ${FOOTER}`);
  if (struggling) p(`> **First, support.** ${SAFETY_LINES.struggling}`);

  // ── At a glance ──
  const ans = get("answer");
  const highlights = SYSTEM_ORDER.map(id => { const h = (get(`${id}.career`, "highlights") || [])[0]; return h ? `- **${ctx.systems[id].label}:** ${h.title}. ${h.why}` : `- **${ctx.systems[id].label}:** ${or(null, id + ".career")}`; });
  const mdates = (get("month", "top") || []).slice(0, 3);
  p(`## At a glance`,
    `**Your question.** ${ctx.question.text}`,
    ctx.question.crisis ? "" : `**The short answer.** ${or(ans && ans.short, "answer")}`,
    `**Where you're at.** ${w.quadrant}: *${Q.tagline}*`,
    `**How you like to work.** ${q.compass.code}: ${q.compass.styles.map(s => STYLES[s].name).join(" / ")}`,
    `**The draw's message for work.** ${or(get("draw.career", "theme"), "draw.career")}`,
    `**One career highlight from each system**`, highlights.join("\n"),
    `**Dates to watch**`, mdates.length ? mdates.map(d => `- **${d.date}** · ${d.note}`).join("\n") : or(null, "month"));

  // ── How this was made ──
  p(`## 1. How this reading was made`,
    `- **${fmtTime(ctx.draw.castAt)}:** your I Ching hexagram and seven Tarot cards were cast from that moment (seed ${ctx.draw.seed}).`,
    `- **${fmtTime(ctx.question.askedAt)}:** you asked your question. The draw was already fixed, so the question couldn't steer it.`,
    `- Each of your five charts was calculated on its own, in a separate instance of the chart engine. Every reading of a chart saw that chart only: not your quiz, not your question, not the draw, not another system.`,
    `- Every piece of writing in this report came from its own fresh request, built from calculated data and your answers. No section was written from another section's words. Sections 10 to 14 are the only ones that look across all five systems, and they work from the charts' data, not from what was written about them.`,
    `- ${TRAD} marks points traditionally read for career in that system. ${PERS} marks the points that stand out for career in your chart.`);

  // ── 2. Work style and quadrant ──
  p(`## 2. Your work style and where you're at`, `### Where you're at: ${w.quadrant}`, `*${Q.tagline}*`,
    `Clarity **${w.clarity}/16** · Capacity **${w.capacity}/16** (11 or more counts as high). On the grid your dot sits ${pct(w.dot.x)} of the way across (capacity) and ${pct(w.dot.y)} of the way up (clarity).`,
    "```\n" + grid(w) + "\n```",
    Q.means, `**What helps:** ${Q.helps}`, `**Your first-week step:** ${Q.first}`,
    `**Your situation:** ${SITUATIONS[q.situation]}.${q.satisfied ? ` "I'm satisfied with my job": ${LIKE[q.satisfied - 1].toLowerCase()}.` : ""}` + (w.burnout ? " You said you're feeling burnt out, so rest comes first in your plan." : ""),
    `### How you like to work: ${q.compass.code}`);
  p("| Polarity | Your lean | Strength |\n|---|---|---|\n" + Object.entries(q.compass.leans).map(([k, l]) => {
    const P = POLARITIES[k];
    return `| ${P.name} (${SIDES[P.a].name} or ${SIDES[P.b].name}) | ${l.toward ? SIDES[l.toward].name : "Both, about equally"} | ${l.band} (${l.percent}%) |`;
  }).join("\n"));
  p(...Object.entries(q.compass.leans).map(([k, l]) => {
    const P = POLARITIES[k];
    if (!l.toward) return `- **${P.name}: flexible.** You draw on both sides: ${SIDES[P.a].name.toLowerCase()} (${SIDES[P.a].gist.replace(/^You \w+ /, "").replace(/( first)?\.$/, "")}) and ${SIDES[P.b].name.toLowerCase()} (${SIDES[P.b].gist.replace(/^You \w+ /, "").replace(/( first)?\.$/, "")}). The setting decides which comes first.`;
    const x = SIDES[l.toward];
    return `- **${P.name}: ${x.name}.** ${x.gist} *Gives you energy:* ${x.gives} *Can wear you down:* ${x.drains}`;
  }).join("\n").split("\n"));
  p(`**Work Focus** (the kind of work that holds your interest): ${q.compass.focus.map(f => `**${FOCUS[f].name}**: ${FOCUS[f].gist}`).join(" Or ")}`,
    `**Work Rhythm** (the setting that brings out your best): ${q.compass.rhythm.map(x => `**${RHYTHM[x].name}**: ${RHYTHM[x].gist}`).join(" Or ")}`);
  if (q.compass.styles.length > 1) p(`Because one of your leans is flexible, ${q.compass.styles.length} styles fit. Read them side by side and notice which feels more like you today.`);
  for (const code of q.compass.styles) {
    const st = STYLES[code];
    p(`#### ${st.name} (${code})`, `*${st.line}*`,
      `- **At your best:** ${st.best}\n- **Watch for:** ${st.watch}\n- **Settings that tend to suit:** ${st.suit}\n- **Jobs to explore:** ${st.jobs.join(", ")} _(${st.evidence.toLowerCase()} list; starting points, not limits)_`);
  }
  if (q.compass.flags.length) p(`**Flags:**`, q.compass.flags.map(f => `- **${f.flag}**${f.polarity ? " (" + f.polarity + ")" : ""}: ${f.text}`).join("\n"));
  p(`**Read through your charts and draw**`, or(get("workstyle.lens", "reading"), "workstyle.lens"));

  // ── 3. The draw ──
  p(`## 3. The draw`, `Cast at ${fmtTime(ctx.draw.castAt)}, before you asked anything.`,
    "| | Drawn |\n|---|---|\n" + `| I Ching | Hexagram ${r.pHex}, ${r.pName}` + (r.rHex ? ` → ${r.rHex}, ${r.rName}` : "") + (r.changing.length ? ` (changing lines ${r.changing.join(", ")})` : " (no changing lines)") + " |\n" +
      r.cards.map((c, i) => `| ${i + 1}. ${c.pos} | ${c.name} |`).join("\n"));
  const ig = get("draw.iching.general");
  p(`### The I Ching: ${r.pName}`, or(ig && ig.primary, "draw.iching.general"),
    ...(r.changing.length ? [ig ? ig.lines : ""] : []), ...(r.rHex ? [`**Becoming ${r.rName}.** ` + (ig ? ig.resulting : "")] : []),
    `**For work:** ${or(get("draw.iching.career", "reading"), "draw.iching.career")}`);
  p(`### The seven cards`);
  r.cards.forEach((c, i) => p(`#### ${i + 1}. ${c.pos} ${c.name}`, `*${cap(POSITION_MEANING[c.pos])}.*`,
    or(get(`draw.card.${i + 1}.general`, "insight"), `draw.card.${i + 1}.general`),
    `**For work:** ${or(get(`draw.card.${i + 1}.career`, "reading"), `draw.card.${i + 1}.career`)}`));
  p(`### The draw for careers in general`, `**${or(get("draw.career", "theme"), "draw.career")}**`, or(get("draw.career", "reading"), "draw.career"));

  // ── 4. The draw and the question ──
  p(`## 4. The draw and your question`, `> ${ctx.question.text}`);
  if (ctx.question.crisis) p(`Your question mentioned something that matters more than any reading. ${SAFETY_LINES.struggling}`);
  else {
    const dq = get("draw.question");
    r.cards.forEach((c, i) => { const hit = dq && (dq.cards.find(x => x.pos === c.pos) || dq.cards[i]); p(`**${i + 1}. ${c.pos} ${c.name}.** ${or(hit && hit.reading, "draw.question")}`); });
    p(`**The hexagram.** ${or(dq && dq.hexagram, "draw.question")}`, `**What the draw says.** ${or(dq && dq.answer, "draw.question")}`);
  }

  // ── 5–9. Each chart ──
  SYSTEM_ORDER.forEach((id, n) => {
    const S = ctx.systems[id], c = get(`${id}.career`), m = get(`${id}.month`);
    p(`## ${5 + n}. ${S.label}`, `**${S.badges.map(b => `${b.name}: ${b.value}`).join(" · ")}**${S.header ? ` · ${S.header}` : ""}`,
      `*Calculated on its own, and read without your quiz, question, draw or any other system.*`, S.timeNote ? `> ${S.timeNote}` : "");
    const trad = S.tabs.flatMap(t => t.items.filter(it => it.career));
    p(`### Career highlights`, `**${TRAD} Traditionally read for career**`, trad.map(it => `- **${it.title}** · ${[it.code, it.sub].filter(Boolean).join(" · ")}: ${it.career}`).join("\n"),
      `**${PERS} What stands out in your chart**`, c ? c.highlights.map(h => `- **${h.title}:** ${h.why}`).join("\n") : or(null, `${id}.career`));
    p(`### Your ${S.label} chart and your work`, or(c && c.reading, `${id}.career`));
    p(`### The chart`, S.chartText);
    p(`### Every point in the chart, with a careers note`);
    const personal = new Set(c ? c.highlights.map(h => h.title) : []);
    S.tabs.forEach(t => {
      p(`#### ${t.name}`, `*${t.blurb}*`);
      const ov = get(`${id}.overview.${t.key}`);
      if (t.overviewPrompt) p(`**Overview.** ${or(ov && ov.overview, `${id}.overview.${t.key}`)}`, `**For work.** ${or(ov && ov.career, `${id}.overview.${t.key}`)}`);
      p(t.items.map((it, i) => {
        const marks = (it.career ? TRAD : "") + (personal.has(it.title) ? PERS : "");
        const note = get(`${id}.item.${t.key}.${i}`, "career");
        return `- ${marks ? marks + " " : ""}**${it.title}** · ${[it.code, it.sub].filter(Boolean).join(" · ")}${it.role ? `. *${cap(it.role)}.*` : ""}\n  - For work: ${or(note, `${id}.item.${t.key}.${i}`)}`;
      }).join("\n"));
    });
    p(`### The next 30 days in ${S.label}`, or(m && m.reading, `${id}.month`));
    if (m && m.dates.length) p(m.dates.map(d => `- **${d.date}** · ${d.note}`).join("\n"));
    if (S.events.length) p("| Date | Career-relevant event |\n|---|---|\n" + S.events.map(e => `| ${e.label} | ${e.text.replace(/\|/g, "/")} |`).join("\n"));
  });

  // ── 10–14. Across the systems ──
  const pr = get("profile");
  p(`## 10. Profile of you`, `*This section and the ones after it look across all five systems at once, using the charts' data.*`, or(pr && pr.summary, "profile"));
  if (pr) {
    const list = (title, xs) => p(`**${title}**`, xs.map(x => typeof x === "string" ? `- ${x}` : `- ${x.point} _(${x.sources})_`).join("\n"));
    list("Strengths", pr.strengths); list("Where you do your best work", pr.settings); list("Watch for", pr.watch);
    list("Where the systems agree", pr.agreements); list("Where they differ", pr.tensions);
  }
  const cu = get("current");
  p(`## 11. Where you are now`, or(cu && cu.reading, "current"));
  if (cu) p(cu.signals.map(x => `- **${x.system}:** ${x.signal}`).join("\n"));
  const mo = get("month");
  p(`## 12. The next 30 days`, `${ctx.window.from} to ${ctx.window.to}.`, or(mo && mo.overview, "month"));
  if (mo) mo.weeks.forEach(x => p(`### Week ${x.week}: ${x.theme}`, x.notes, (x.dates || []).map(d => `- **${d.date}** · ${d.note} _(${d.systems})_`).join("\n")));
  if (!ctx.question.crisis) p(`## 13. Your question, answered`, `> ${ctx.question.text}`, `**In short:** ${or(ans && ans.short, "answer")}`, or(ans && ans.detailed, "answer"));

  // ── 14. The plan ──
  const pl = get("plan");
  p(`## 14. Your tailored 4-week plan: ${w.quadrant}`, `*${Q.tagline}*`, or(pl && pl.intro, "plan"),
    `Every step works on its own, with nothing to buy.`);
  const jfy = justForYou(q);
  if (jfy.length) p(`**Just for you**`, jfy.map(x => `- ${x}`).join("\n"));
  Q.weeks.forEach((wk, i) => {
    const mine = pl && pl.weeks[i];
    p(`### Week ${i + 1} · ${wk.title}`, `*${wk.why}*`, wk.steps.map(x => `- [ ] ${x}`).join("\n"),
      `**For you.** ${or(mine && mine.forYou, "plan")}`, `**When.** ${or(mine && mine.when, "plan")}`);
    if (!struggling) p(`> **Optional, with New Page:** ${wk.optional}`);
  });
  if (q.safety === "low") p(`*${SAFETY_LINES.low}*`);
  if (struggling) p(`*${SAFETY_LINES.struggling}*`);

  p(`## 15. Support and limits`, FOOTER,
    `Full support list: Lifeline 13 11 14 · Beyond Blue 1300 22 4636 · 13YARN 13 92 76 (Aboriginal and Torres Strait Islander crisis support) · Emergency 000.`,
    `Gene Keys and Human Design are systems created by others. This reading is independent and isn't affiliated with or endorsed by Gene Keys or Jovian Archive. The Work Style Compass is a reflection tool that hasn't been formally validated; its job lists describe where people with each style tend to be found, not who will succeed there.`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n");
}

const cap = x => (x ? x[0].toUpperCase() + x.slice(1) : "");
const pct = x => Math.round(x * 100) + "%";
const fmtTime = iso => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
function grid(w) {
  // 2×2 grid: clarity runs up, capacity runs right; the dot is where they sit.
  const W = 13, H = 4, rows = [];
  const x = Math.min(2 * W - 1, Math.round(w.dot.x * (2 * W - 1))), y = Math.min(2 * H - 1, Math.round((1 - w.dot.y) * (2 * H - 1)));
  const line = "+" + "-".repeat(W) + "+" + "-".repeat(W) + "+";
  const label = (a, b) => "| " + a.padEnd(W - 1) + "| " + b.padEnd(W - 1) + "|";
  for (let r = 0; r < 2 * H; r++) {
    if (r === 0) rows.push("clarity ↑", line);
    if (r === H) rows.push(line);
    let row = r === 0 ? label("Unstick", "Launch") : r === H ? label("Recharge", "Explore") : "|" + " ".repeat(W) + "|" + " ".repeat(W) + "|";
    if (r === y) { const col = x < W ? 1 + x : 2 + x; row = row.slice(0, col) + "●" + row.slice(col + 1); }
    rows.push(row);
  }
  rows.push(line, " ".repeat(W + 1) + "capacity →");
  return rows.join("\n");
}
