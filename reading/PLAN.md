# Career Reading: plan

> Written while the engine was first built inside Divinatey, so file paths below refer to that layout. Paths in this repo are in `README.md`.

A long, personal document about someone's work and career. It combines a short work-style and "where are you at" quiz, a query-blind I Ching and Tarot draw, five birth charts (Natal, Vedic, Human Design, Gene Keys, Numerology), the next 30 days of timing in each system, and a tailored version of the New Page 4-week plan.

This file has the design: what the report contains, then (working backwards) how the machine produces it, then the person's experience.

---

## 1. The report

Section order follows the brief: each system on its own and careers-focused, then the person, then now, then the next 30 days, then the plan. A short "at a glance" page sits at the front, because a 40-page document needs its answer up front.

| # | Section | What's in it | Built from |
|---|---|---|---|
| 0 | **At a glance** | The short answer to their question. Their quadrant and work style. The five most career-relevant findings, one per system. The three dates to watch in the next 30 days. | Step outputs, assembled (no new AI call) |
| 1 | **How this reading was made** | The order things happened in (cast first, question second), the independence rule, the disclaimer. | Fixed text + timestamps |
| 2 | **Your work style and where you're at** | Quadrant with the dot, Work Style Compass result (four leans, code, Work Focus, Work Rhythm, style), what each means, flags. | Quiz scoring + guide text (no AI) |
| 3 | **The draw** | (a) The I Ching hexagram and each of the 7 cards, general meaning. (b) Each, read for careers in general. (c) The whole spread for careers in general. | Draw data only |
| 4 | **The draw and your question** | Each card and the hexagram applied to their question, then the spread's answer. | Draw data + question |
| 5–9 | **Your charts, one by one** (Natal, Vedic, Human Design, Gene Keys, Numerology) | For each: the chart as text tables. **Career highlights** box (traditional career points, plus the 3–5 that stand out in this chart). Every panel item, with its reference summary (title, position, meaning) and a one-line careers note. Each tab's overview with a careers layer. A careers reading of the chart. This system's next 30 days. | That one system's data only |
| 10 | **Profile of you** | Where the systems agree and differ on strengths, needs, best settings and blind spots. Their work style read through the charts. | Career fact cards from all five + quiz result |
| 11 | **Where you are now** | Their quadrant and situation, alongside each system's current timing (dasha, personal year, current transits) and the draw. | Current-timing data + quiz + draw |
| 12 | **The next 30 days** | A week-by-week view of career-relevant timing across all five systems, with dates. | All five forecasts, career-filtered |
| 13 | **Your question, answered** | The detailed answer. | Everything above, as data |
| 14 | **Your tailored 4-week plan** | The New Page plan for their quadrant, word for word, with "Just for you" tweaks and, under each week, a "For you" note individualised from their charts, work style and the next 30 days' dates. | Plan template + tweaks + data |
| 15 | **Support and limits** | Coaching not therapy, Lifeline, AI can be wrong. | Fixed text |

### What "career-relevant" means

Two layers, shown with different marks so people can tell them apart.

- **Traditionally career-relevant** (rule-based, the same for everyone):
  - Natal: Midheaven, 10th house and its ruler, 6th house, 2nd house, Sun, Saturn, Jupiter, Mercury, Mars, and aspects to the Midheaven, Sun or Saturn.
  - Vedic: Lagna lord, 10th house and its occupants, Sun, Saturn, Mercury, Jupiter, the current Mahadasha and Antardasha, Raja and Dhana yogas.
  - Human Design: type, strategy, authority, profile, incarnation cross, Throat, G and Heart (Ego) centres, channels through them, the Sun gates.
  - Gene Keys: Life's Work, Radiance, Purpose, and the whole Pearl sequence (Brand, Vocation, Culture, Pearl).
  - Numerology: life path, expression, soul urge, current pinnacle and challenge, personal year.
- **Personally career-relevant** (picked by the AI from that one chart): the 3–5 points that stand out *in this chart*. Examples: a tight aspect to the Midheaven, a stellium, a defined Throat with many gates, a karmic debt on the expression number.

### Panel items

"All of the individual summaries in the panel" is read as: every item in each system's guide panel appears, with its **reference summary** (the fixed title, position and meaning the free panel already shows) and a **one-line careers note** (AI). The **career-highlighted items** also get a full explanation. A full "Explain" for all 154 items would add about 25,000 words; the engine can do it (`fullItems: true`), but the default keeps the document readable.

---

## 2. The machine (working backwards from the report)

### The independence rule

1. **Every AI step is one fresh prompt, built on the server from calculated data and the person's own answers.** No step ever sees text another step wrote. "Layers" (general → careers → the question) are separate lenses on the same data, not a chain of outputs. This stops one step's mistakes or framing leaking into the next.
2. **Stage C steps see one system and nothing else**: not the quiz, not the question, not the draw, not another system. Each chart is calculated in its own isolated engine instance.
3. **The draw is cast before the question exists.** The cast is stored with a timestamp; the question box opens only after. The report records both timestamps.
4. **Cross-system steps are a separate, explicit stage (D)** that gets *data* from every system (fact cards, scores, forecasts) and never another step's text. This is the documented exception to "systems never mix", asked for in this brief.

### Stages and steps

| Stage | Step | Runs | Gets | Returns |
|---|---|---|---|---|
| **0 Intake** | `quiz.score` | once | 20 answers | quadrant + dot, Compass leans + code + style, flags (code, no AI) |
| | `charts.compute` | ×5 | birth details | each chart, isolated (code, no AI) |
| **A Draw** (before the question) | `draw.cast` | once | quantum seed + time | hexagram, changing lines, 7 cards (code) |
| | `draw.iching.general` | 1 | hexagram data | primary, lines, resulting |
| | `draw.card.general` | ×7 | one card + its position | meaning in position |
| | `draw.iching.career` | 1 | hexagram data + careers lens | careers reading |
| | `draw.card.career` | ×7 | one card + position + careers lens | careers reading |
| | `draw.career` | 1 | whole spread + careers lens | spread for careers in general |
| **B Question** | `draw.question` | 1 | whole spread + the question | each card and the hexagram on the question, then the answer |
| **C Charts** (×5, isolated) | `S.item` | ×154 | one panel item's data | one-line careers note (fast model) |
| | `S.item.full` | ×3–8 per system | one highlighted item's data | full explanation + careers |
| | `S.overview` | ×1–4 per system | one tab's items | overview + careers layer |
| | `S.career` | ×5 | this chart's career points + whole-chart facts | careers reading + 3–5 personal highlights |
| | `S.month` | ×5 | this system's 30-day events | the month in this system, key dates |
| **D Synthesis** (data from all) | `profile` | 1 | career fact cards ×5 + quiz result | profile of the person |
| | `workstyle.lens` | 1 | quiz result + fact cards + draw data | work style and quadrant through the charts and draw |
| | `current` | 1 | quiz situation + current timing ×5 + draw | where you are now |
| | `month` | 1 | career-filtered events ×5 | the next 30 days, week by week |
| | `answer` | 1 | question + all of the above *data* | short answer + detailed answer |
| | `plan` | 1 | quadrant plan (verbatim) + tweaks + data | "For you" note per week, plus timing |
| **E Assemble** | `render` | once | all outputs | Markdown / HTML / PDF |

About **190 AI calls**: ~154 short ones on the fast model, ~35 longer ones on the main model. Stage C items and A cards run in parallel (concurrency limit about 8). Expected time: **3–6 minutes**, so the report is generated in the background and emailed, with a live progress page.

**Order and dependencies.** A must finish its cast before B's question is collected. C is independent of A and B and starts as soon as birth details arrive (it can run while the person types their question). D needs only data, so it can start as soon as the calculations are done; it never waits on another step's text.

### Safety

- Wellbeing "I'm really struggling" → the support screen first (Lifeline 13 11 14, Beyond Blue, 13YARN, 000). If they continue, the report has no sales prompts or New Page offers, and the plan ends with Lifeline.
- "Mostly low" → the gentle line under the plan.
- Burnout flag (statement 4 "mostly" or "very like me") → rest-first line in the plan.
- The question is checked for crisis words before the draw is read against it.
- Every prompt carries the "reflection, not prediction or professional advice" rule. Questions about a legal, medical or financial decision get a nudge towards professional advice.

### Data kept

The cast, the answers and the outputs are stored with the report so it can be re-rendered without new AI calls. The full name at birth is used for the numerology calculation only; no prompt contains it.

---

## 3. The person's experience

One question per screen, a progress bar, a Back link, no account needed to start.

1. **Start.** "Your career, read five ways." What they'll get, how long it takes (about 8 minutes to answer, 5 minutes to generate), price.
2. **How you like to work** (12 paired statements, five-point scale). The Work Style Compass short form.
3. **Where you're at** (8 statements, four-point scale). The New Page quiz, word for word.
4. **Your situation** (1–2 questions) and **how you've been feeling** (1 question; safety).
5. **Your birth details.** Full name at birth, date, time (with an "I don't know my birth time" option that drops time-sensitive items and says so), place.
6. **The cast.** "We cast your draw now, before you tell us your question, so the question can't steer the cards." A button to cast; the hexagram and seven face-down cards appear.
7. **Your question.** A text box with prompts ("Be specific. Name the decision, the options and the timing.").
8. **Generating.** A live list of the real steps ("Reading card 3 of 7 for careers", "Calculating your Vedic chart", "Finding the next 30 days in Human Design"). Email when ready.
9. **The report.** A contents sidebar, career highlights marked with the highlighter, the plan with tick boxes, and a download (PDF and Markdown).

### Open decisions

- **Brand.** The prototype uses the New Page look, because that brand guide came with the brief. Divinatey's own look (purple gradient) is the alternative.
- **Price and where it sits.** Not set. Could be a one-off purchase, part of New Page, or a paid-plan feature.
- **Compass short form.** 12 statements: the 8 published in the guide plus 4 new ones written in the same style, so each polarity has both sides keyed. Check the new 4 against the full 40-question bank, or use the full 40.
- **Unknown birth time.** Natal houses, Ascendant and Midheaven, the Vedic Lagna, and some Human Design gates need it. The plan above drops those items rather than guessing.
