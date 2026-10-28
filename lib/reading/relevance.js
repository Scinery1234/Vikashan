// Which chart points are traditionally read for work and career, system by
// system. These rules are the same for everyone; the personal highlights come
// from each system's own career step. Each rule sees one system only.

const MODERN_RULER = { Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Pluto", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Uranus", Pisces: "Neptune" };
const RASHI = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"];
const RASHI_LORD = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];
const signIn = (s, list) => list.find(x => new RegExp("\\b" + x + "\\b").test(s));

// Returns a Map: "tabKey:index" → reason (plain words).
export function traditionalCareer(system, tabs) {
  const out = new Map(), tab = k => tabs.find(t => t.key === k) || { items: [] };
  const mark = (t, i, why) => { if (!out.has(t + ":" + i)) out.set(t + ":" + i, why); };
  const each = (t, fn) => tab(t).items.forEach((it, i) => { const why = fn(it); if (why) mark(t, i, why); });

  if (system === "natal") {
    const tenth = tab("houses").items[9];
    const tenthSign = tenth && signIn(tenth.code, Object.keys(MODERN_RULER));
    const ruler = tenthSign && MODERN_RULER[tenthSign];
    const roles = { Sun: "your sense of purpose and where you want to shine", Saturn: "mastery, responsibility and your long-term career", Jupiter: "growth and opportunity", Mercury: "skills, thinking and communication at work", Mars: "drive and how you go after things", Midheaven: "your public role, calling and reputation" };
    const planet = it => [roles[it.title], ruler === it.title ? "it rules your 10th house of career" : "", /\b10th house\b/.test(it.sub) ? "it sits in your 10th house of career" : ""].filter(Boolean).join("; ");
    each("big3", planet);
    each("planets", planet);
    each("houses", it => ({ "2nd House": "money, earning and what you value", "6th House": "daily work, routines and service", "10th House": "career, vocation and reputation" })[it.title]);
    each("aspects", it => /Midheaven/.test(it.title) ? "it touches your Midheaven (career and calling)" : /\bSun\b/.test(it.title) && /\bSaturn\b/.test(it.title) ? "purpose meets mastery" : /\bSaturn\b/.test(it.title) && /Conjunction|Square|Opposition/.test(it.title) ? "a Saturn tension point: where effort builds a career" : "");
  }

  if (system === "vedic") {
    const lagna = tab("grahas").items.find(it => /^Lagna/.test(it.title));   // absent without a birth time
    const ls = lagna ? RASHI.findIndex(r => (lagna.code || "").includes(r)) : -1;
    const lord10 = ls >= 0 ? RASHI_LORD[(ls + 9) % 12] : null, lordL = ls >= 0 ? RASHI_LORD[ls] : null;
    const roles = { Sun: "status, authority and recognition (karaka of career)", Saturn: "work, service and endurance (karaka of profession)", Mercury: "skill, trade and communication", Jupiter: "wisdom, counsel and good fortune" };
    each("grahas", it => {
      if (/^Lagna/.test(it.title)) return "the lens for the whole chart" + (lordL ? "; Lagna lord " + lordL : "");
      const g = it.title.split(" ")[0];
      return [roles[g], lord10 === g ? "it is the lord of your 10th house (karma bhava, career)" : "", /\b10th house\b/.test(it.sub) ? "it sits in your 10th house (career)" : ""].filter(Boolean).join("; ");
    });
    each("nak", it => /^Lagna in|^Sun in|^Saturn in/.test(it.title) || (lord10 && it.title.startsWith(lord10 + " in")) ? "the nakshatra of a career point" : "");
    each("dasha", it => /^Current/.test(it.title) ? "the period shaping your work life now" : "");
    each("yogas", it => /Raja|Dhana|Gaja Kesari|Amala|Budha-Aditya|Pancha/i.test(it.title) ? "a yoga traditionally read for status, wealth or reputation" : "");
  }

  if (system === "human-design") {
    const typeRoles = { Type: "how your energy works with others at work", Strategy: "how to find the right work with the least resistance", "Inner Authority": "how you make good career decisions", Profile: "the role you play in work and teams", "Incarnation Cross": "your life theme and purpose" };
    each("type", it => typeRoles[it.title]);
    each("centres", it => ({ Throat: "expression and getting things done", "G (Identity)": "direction and the role you take", "Heart (Ego)": "willpower, worth and money", Sacral: "sustainable work energy" })[it.title]);
    each("channels", it => /Throat|G \(Identity\)|Heart/.test(it.sub + " " + it.role) ? "a channel through a career centre (Throat, G or Heart)" : "");
    each("gates", it => /Sun$/.test(it.title) ? "the Sun gate: your core theme" : "");
  }

  if (system === "gene-keys") {
    each("activation", it => ({ "Life's Work": "what you are here to do: your outer genius", Radiance: "what keeps you well enough to work at your best", Purpose: "the deep reason beneath your work" })[it.title]);
    each("venus", it => it.title === "Core" ? "the core wound of self-worth, and the source of vocation" : "");
    each("pearl", () => "the Pearl sequence: vocation, prosperity and how your work is seen");
  }

  if (system === "numerology") {
    each("core", it => ({ "Life Path": "the main road of your working life", Expression: "your natural talents and how you're built to use them", "Soul Urge": "what motivates you at work" })[it.title]);
    each("periods", it => /now/.test(it.sub) ? "the long stretch of life you're in now" : "");
    each("cycles", it => it.title === "Personal Year" ? "the theme of this year for you" : "");
  }
  return out;
}

// Career-relevant forecast events, per system: drop the fast Moon's daily
// noise and keep what touches career points.
const NATAL_CAREER = /natal (Midheaven|Sun|Saturn|Jupiter|Mercury|Mars) \(|in your 10th house\)/;
const GK_CAREER = /your (Life's Work|Radiance|Purpose|Vocation|Culture|Pearl|Core) \(/;
export function careerEvents(system, forecast, limit = 24) {
  const keep = (d, it) => {
    if (it.kind === "station" || it.kind === "dasha") return true;
    if (system === "natal") return it.kind === "personal" && it.body !== "Moon" && NATAL_CAREER.test(it.text);
    if (system === "gene-keys") return it.kind === "personal" && it.body !== "Moon" && GK_CAREER.test(it.text);
    if (system === "vedic") return it.kind === "ingress" || (it.kind === "moon" && /Chandrashtama/.test(it.text));
    if (system === "human-design") return it.kind !== "other";
    if (system === "numerology") return it.kind === "cycle" || (it.kind === "day" && /^Personal day (1|8) /.test(it.text));
    return false;
  };
  // An aspect is listed when it first comes into orb and on its first exact day; repeats are dropped.
  const seen = new Map(), out = [];
  forecast.forEach(d => d.items.filter(it => keep(d, it)).forEach(it => {
    const key = it.text.replace(/ \(exact\)$/, "").replace(/Gene Key (\d+)\.\d/, "Gene Key $1"), exact = / \(exact\)$/.test(it.text), st = seen.get(key) || { first: false, exact: false };
    if (!/personal|sky/.test(it.kind) || (!st.first && !exact) || (exact && !st.exact)) out.push({ date: d.date, label: d.label, kind: it.kind, text: it.text });
    seen.set(key, { first: true, exact: st.exact || exact });
  }));
  if (out.length <= limit) return out;
  // Too many: keep an even spread across the whole window.
  return Array.from({ length: limit }, (_, i) => out[Math.round(i * (out.length - 1) / (limit - 1))]);
}
