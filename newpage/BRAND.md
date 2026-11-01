# New Page brand guide

Use this guide to design, write or build anything for **New Page**, the 4-week career program by **Purposefields**. Follow it exactly unless you're told otherwise. The live reference is the quiz at `vikashan.com.au/newpage` and the program page at `vikashan.com.au/newpage/program`. The code is in `newpage/styles.css`.

---

## 1. The idea

**A fresh sheet of ruled paper.** Everything looks like a clean page in a notebook:

- faint blue ruled lines
- a red margin line down the left
- a folded top-right corner
- a lime highlighter that marks the one thing on each screen that matters

The feeling: calm, hopeful, practical and personal, like a good coach handing you a fresh page and a pen. **Mark the important thing; don't shout.**

Things New Page is not:
- cream paper with a serif font and terracotta accents (Vikashan's main site uses that look; New Page deliberately doesn't)
- purple gradients
- dark "tech" screens
- corporate stock imagery
- emoji

## 2. Names

| Name | Use |
|---|---|
| **Purposefields** | The organisation New Page is by. Always "by Purposefields" or "a career program by Purposefields". The web address stays a subdomain of vikashan.org, and that is fine. |
| **New Page** | The program. Title case in sentences ("Join New Page"). The logo wordmark is always lowercase: **new page**. |
| **Vik** | The coach (Vikashan). Use "Vik" in friendly copy and emails, which are signed "Vik". |
| **Vikashan** | Vik's coaching practice and the home of the website address. Don't use it as New Page's publisher name. |
| **Sky** | The AI Coach inside New Page. Always "Sky" or "Sky, your AI Coach", never "Vik" and never "the Career Coach". Sky has nine focus areas (Career, Recovery, Action, Executive function, Reducing the charge, CBT, Interview, Offer and negotiation, Clarity compass). Say plainly that Sky is an AI. |
| Tools | Keep their own names: The Compass, Planner, Notes, Resume writer, Cover letter writer. |
| Quadrants | **Recharge, Explore, Unstick, Launch.** Only reveal these after someone finishes the quiz. Don't name them, or say there are four, on the quiz start screen or in ads. |

## 3. Logo

A page with a folded corner, with a highlighter stroke across it, next to the lowercase wordmark **new page** in Familjen Grotesk Bold. Under it, optionally, the tagline "A CAREER PROGRAM BY VIKASHAN" in small uppercase Figtree, letter-spaced.

```svg
<svg width="32" height="36" viewBox="0 0 32 36" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 2h18l8 8v24H3z" fill="#FFFFFF" stroke="#15203B" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M21 2v8h8" fill="none" stroke="#15203B" stroke-width="2.4" stroke-linejoin="round"/>
  <rect x="7" y="19" width="17" height="6" rx="2" fill="#D4F36B"/>
  <path d="M8 29h11" stroke="#15203B" stroke-width="2.2" stroke-linecap="round"/>
</svg>
```

- **On dark:** fill the page `#15203B`, stroke `#FFFFFF`, keep the lime bar.
- **Spacing:** keep the mark and wordmark 8–16px apart. Wordmark letter-spacing about −0.02em.
- **Don't:** recolour the highlighter bar, stretch the mark, or write "New Page" in the logo with capitals.

## 4. Colour

The background is always light. Text is ink. **Use the highlighter sparingly: once or twice per screen.**

| Token | Hex | Use |
|---|---|---|
| Ink | `#15203B` | Text, primary buttons, outlines, the logo |
| Muted | `#56607A` | Secondary text, labels, captions |
| Paper | `#FFFFFF` | Main background |
| Paper 2 | `#F5F7FB` | Soft panels, cards on white |
| Rule | `#DCE3EE` | Borders, dividers |
| Rule line | `#EDF1F7` | Ruled-paper lines in the background |
| Margin | `#FF7A66` | The red margin line only |
| Note | `#E0523D` | Handwritten margin notes (text) |
| Highlighter | `#D4F36B` | Highlighting key words, selected answers, the primary button's shadow |
| Link | `#1F4FD8` | Text links |
| Error | `#B42318` | Error messages |

**Quadrant highlighters.** Use these only on result pages, share cards and anything after the quiz.

| Quadrant | Highlighter | Tint (soft background) |
|---|---|---|
| Recharge | `#CDBDFF` (lilac) | `#EFEAFF` |
| Explore | `#A8DBFF` (sky) | `#E4F4FF` |
| Unstick | `#FFC27A` (tangerine) | `#FFF0DC` |
| Launch | `#C9EF6E` (lime) | `#EEF9D3` |

Text on any highlighter or tint is always Ink. Ink on white, highlighter and tints, and Muted on white, all pass WCAG AA contrast.

## 5. Type

Google Fonts:
```
https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@600;700&family=Figtree:wght@400;500;600;700&family=Caveat:wght@600&display=swap
```

| Role | Font | Weight | Use |
|---|---|---|---|
| Display | **Familjen Grotesk** | 700 (600 for subheads) | Headlines, quadrant names, buttons, card titles. Tight letter-spacing (−0.5 to −2.5px at large sizes). |
| Body | **Figtree** | 400 body, 500–600 emphasis, 700 bold | Everything else. 17px body on the web, 16px in emails. |
| Hand | **Caveat** | 600 | Short margin notes only, such as "takes 3 minutes", "you're in", "sent!". Always in Note red, rotated −2° to −3°, never more than about five words, at most once per screen. |

**Sizes on the web:**
- H1: 38–52px on phones (`clamp(38px, 9vw, 52px)`), up to 64px on desktop
- H2: 26–32px
- Body: 17px
- Small: 14px
- Labels: 12px uppercase, 700, letter-spacing 1.4px, Muted

Headlines use `text-wrap: balance`. Keep line length to about 65 characters.

**The highlighter effect** goes on key words in headlines and short phrases:
```css
.hl { background: linear-gradient(transparent 56%, #D4F36B 56%, #D4F36B 92%, transparent 92%); }
```
It looks like a highlighter stroke across the lower half of the words. Use it on one phrase per heading, never a whole paragraph.

## 6. Layout

- **Ruled paper background:** white, with `repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #EDF1F7 31px, #EDF1F7 32px)`. That's one line every 32px; scale it up for large images (about 52px at 1200px wide).
- **Margin line:** 2px wide, `#FF7A66`, at about 85% opacity, running the full height about 32px from the content's left edge. Content sits to its right, starting about 48px from the screen edge on phones.
- **Folded corner** (optional, for share cards and images): a triangle in the top-right with a `#F5F7FB` fold and a hairline `#DCE3EE` crease.
- **Width:**
  - Flows and forms (quiz, email screens): one column, max 600px.
  - Marketing pages: up to 1120px on desktop, with section labels and headings in a left column (280px) and content on the right. One column on phones.
- **Spacing:** sections are 32–48px apart, separated by a 1.5px **dashed** `#DCE3EE` line. Use flex or grid with `gap` inside.
- **Corners:** 14px on buttons and inputs, 16px on cards, 99px on chips, 12px on small tiles.

## 7. Components

- **Primary button:**
  - Ink background, white Familjen Grotesk 700 at 19px, 56px tall, radius 14px
  - signature shadow: a solid **4px lime underline**, `box-shadow: 0 4px 0 #D4F36B`
  - when pressed, it moves down 2px
  - on result pages the shadow takes the quadrant colour
- **Secondary button:** white background, 2px Ink border, Ink text, 52px tall.
- **Text link button:** no background, Link blue, underlined, 44px tall for touch.
- **Answer option (quiz):** full-width, white, 1.5px Rule border, radius 14px, at least 56px tall, Figtree 17px. **Selected:** Highlighter background, 2px Ink border, bold.
- **Chip:** like an answer option but pill-shaped, inline, at least 44px tall, wrapping. It uses the same selected style.
- **Card:** white, 1.5px Rule border, radius 16px, padding 16–18px. **Soft panel:** Paper 2 background, no border.
- **Price or feature card:** white, 2px Ink border, with the lime 4px shadow.
- **Progress bar:** 8px, fully rounded, track `#E9EEF6`, fill Ink, with "3 of 10" in Muted beside it.
- **Label:** 12px uppercase Figtree 700, letter-spaced, Muted. Put it above section headings ("WHO IT'S FOR").
- **Numbered steps:** a lime circle with a 2px Ink border and the number in Familjen Grotesk. Only use these for real sequences.
- **Ticks:** a drawn Ink check mark (an L-shaped border rotated −45°), not an icon font.
- **Result grid (quiz):** a 2×2 grid, one cell per quadrant. The person's quadrant is in its full highlighter colour and the others in their tints, with an Ink dot (white ring) showing where they sit. Clarity runs up, capacity runs right.
- **Icons:** simple inline stroke SVG in Ink, 2–2.4px strokes. No emoji, and no filled icon packs.

## 8. Voice and tone

**Warm, plain, a little bit cheeky. Talk like a good coach across a table, not a brochure.** Use Australian spelling ("organise", "colour"), but always write "program", not "programme".

- Short sentences. Active voice. Second person ("you").
- Be specific. Say exactly what the person will get and do ("a 4-week plan", "a 60-minute 1:1 session with Vik").
- Name hard things kindly: "That's not laziness. It's usually a few things stacked up."
- Small steps over big promises: "Shrink it until it takes 15 minutes."
- Never promise outcomes ("land your dream job"). Never use hype ("Unlock your full potential!", "Transform your life").
- Avoid jargon (synergy, leverage, empower, journey) and clinical words (diagnosis, assessment, symptoms, disorder).
- No exclamation marks, except in a handwritten note ("sent!").
- Buttons say exactly what happens: "Let's start", "Get my full 4-week plan", "Send my plan", "Tell me when it opens", "Book a free call".
- Emails are written in first person as Vik, signed "Vik", short (under 120 words for follow-ups), with one job each.

**Examples:**

| Yes | No |
|---|---|
| What's your next career move? | Discover your ultimate career destiny! |
| Rest first, then the next page. | Burnout? We've got the solution! |
| Change your mind within 7 days? Full refund. | 100% risk-free, money-back guarantee!!! |
| You'll be among the first to hear when New Page opens. | Join our exclusive VIP waitlist today! |

**Recurring phrases** that sound like New Page:
- "Work out where you're at. Start where you're going."
- "Turn the page."
- "a new page"
- "one small step, then the next"
- "a coach in your corner"

## 9. Content rules

- **Coaching, not therapy.** Say so in the footer of every page and email: "Coaching, not therapy. For people 18 and over."
- **Crisis support is always visible.** Every page footer and email includes: "In crisis? Call Lifeline on 13 11 14, any time. In an emergency, call 000."
- **The full support list** (on the support screen): Lifeline 13 11 14, Beyond Blue 1300 22 4636, 13YARN 13 92 76, Emergency 000.
- **If someone says they're really struggling,** show support first and remove every sales prompt.
- **Price facts:**
  - $500 for 4 weeks, including one 60-minute 1:1 session with Vik
  - optional renewal at $500 a month, including a monthly session
  - extra 1:1 hours $250
  - full refund within 7 days, or the next month free if you do the four weeks and don't move forward
  - prices include GST
  - 5 full scholarships a month, supported by Purposefields
  - free 20-minute discovery call
- **The quadrants are a coaching tool, never a label or diagnosis.** Always say "you're in Explore" (a place right now), never "you are an Explorer".
- **Use real content.** No invented testimonials, statistics or client stories. Leave a clear placeholder instead, like [CLIENT STORY].

## 10. Email style

- White card on a `#F5F7FB` background, max 580px wide, with a 1px Rule border and 14px corners.
- **Header:** "new page" in Familjen Grotesk Bold, then "BY VIKASHAN" in small uppercase Muted.
- **Body:** Figtree, falling back to Helvetica or Arial, 16px, line-height 1.6, Ink.
- Use the highlighter effect on one key phrase. Buttons are solid Ink with white text and 12px corners.
- **Footer:** the crisis line, the coaching disclaimer and an unsubscribe link.

## 11. Social and share images

- **Link preview image:** 1200×630, on ruled paper with the margin line and folded corner. Headline in Familjen Grotesk at about 96px, with a highlighted phrase and a Caveat note above it. The logo bottom-left and `vikashan.com.au/newpage` bottom-right.
- **Result share card:** 1080×1080, reading "I'm in {Quadrant}." The quadrant name is highlighted in its colour, with the tagline, a small 2×2 grid with the dot, the quiz question and the URL.
- **Taglines by quadrant:**
  - Recharge: "Rest first, then the next page."
  - Explore: "Energy, ideas, and a new page to fill."
  - Unstick: "One small step, then the next."
  - Launch: "Ready to turn the page."

## 12. CSS starter

```css
:root {
  --ink: #15203B; --muted: #56607A; --paper: #FFFFFF; --paper-2: #F5F7FB;
  --rule: #DCE3EE; --rule-line: #EDF1F7; --margin: #FF7A66; --note: #E0523D;
  --hl: #D4F36B; --link: #1F4FD8; --error: #B42318;
  --recharge: #CDBDFF; --explore: #A8DBFF; --unstick: #FFC27A; --launch: #C9EF6E;
  --display: 'Familjen Grotesk', ui-sans-serif, system-ui, sans-serif;
  --body: Figtree, ui-sans-serif, system-ui, sans-serif;
  --hand: Caveat, cursive;
}
body {
  margin: 0; color: var(--ink); font: 17px/1.5 var(--body);
  background: var(--paper) repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--rule-line) 31px, var(--rule-line) 32px);
}
h1, h2 { font-family: var(--display); font-weight: 700; letter-spacing: -0.5px; text-wrap: balance; }
.hl { background: linear-gradient(transparent 56%, var(--hl) 56%, var(--hl) 92%, transparent 92%); }
.note { font: 600 28px/1 var(--hand); color: var(--note); transform: rotate(-3deg); display: inline-block; }
.btn-primary { background: var(--ink); color: #fff; border: 0; border-radius: 14px; min-height: 56px; padding: 10px 24px;
  font: 700 19px var(--display); box-shadow: 0 4px 0 var(--hl); }
```

## 13. Quick checklist

Before you finish anything for New Page, check:

- [ ] Light ruled-paper background, Ink text, with no cream, gradients or dark mode.
- [ ] Highlighter used once or twice, on the words that matter most.
- [ ] Familjen Grotesk headlines, Figtree body, and at most one Caveat note.
- [ ] Buttons say exactly what happens. The primary button has the lime underline shadow.
- [ ] Copy is warm and plain, with no hype, no exclamation marks and no clinical words.
- [ ] "Coaching, not therapy" and the Lifeline number are in the footer.
- [ ] Quadrant names appear only after the quiz.
- [ ] Prices and promises match section 9.
- [ ] Works at 390px wide, with touch targets at least 44px tall.
