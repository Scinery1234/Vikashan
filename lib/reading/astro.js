// The chart engine, from Divinatey: calculates each system from birth details
// on the server. Only the parts the Career Reading uses are kept here.
//
// Each system is loaded into its own instance of the shared core, so no system
// can see another system's code, data or state.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "astro");
const read = f => fs.readFileSync(path.join(dir, f), "utf8");
const CORE = ["core/astronomy.js", "core/tz.js", "core/core.js"].map(read).join("\n;\n");

export const SYSTEMS = {
  "gene-keys": "genekeys",
  "human-design": "humandesign",
  "natal": "natal",
  "vedic": "vedic",
  "numerology": "numerology",
};

function instantiate(extraSrc, exportsSrc) {
  const win = {};
  const doc = { addEventListener() {}, getElementById() { return null; } };
  // `var SYSTEM` gives core's functions the module's SYSTEM, as window.SYSTEM does in a browser.
  const body = "var SYSTEM;\n" + CORE + "\n;\n" + extraSrc + "\n;\nSYSTEM = window.SYSTEM;\nreturn " + exportsSrc + ";";
  return new Function("window", "document", body)(win, doc);
}

const engines = {};
for (const [id, mod] of Object.entries(SYSTEMS)) {
  engines[id] = instantiate(read(`systems/${mod}.js`),
    "{ SYSTEM, chartBodyHTML, referenceData, toUTC, tzUsable }");
}
const placeEngine = instantiate(read("core/cities.js"), "{ searchPlaces }");

// Builds the place index (111k places) ahead of the first search.
export function warmPlaces() { placeEngine.searchPlaces("zz"); }

export function searchPlaces(q) {
  return placeEngine.searchPlaces(String(q).slice(0, 80)).slice(0, 12)
    .map(c => ({ label: c.label, tz: c.tz, lat: c.lat, lon: c.lon }));
}

export class ChartInputError extends Error {}

// Validates raw request input. Returns a clean input object or throws ChartInputError.
export function parseChartInput(body) {
  const b = body || {};
  const engine = engines[b.system];
  if (!engine) throw new ChartInputError("unknown system");
  const date = String(b.date || ""), time = String(b.time || "12:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ChartInputError("invalid date");
  const year = +date.slice(0, 4);
  if (year < 1800 || year > 2100 || isNaN(Date.parse(date + "T00:00:00Z"))) throw new ChartInputError("invalid date");
  if (!/^\d{2}:\d{2}$/.test(time) || +time.slice(0, 2) > 23 || +time.slice(3) > 59) throw new ChartInputError("invalid time");
  // Date-only systems (numerology) don't need the birth place; without one, the day is read in UTC.
  const tz = engine.tzUsable(String(b.tz || "")) || (engine.SYSTEM.dateOnly && !b.tz ? "UTC" : null);
  if (!tz) throw new ChartInputError("invalid timezone");
  const name = String(b.name || "").trim().slice(0, 60);
  const inp = { system: b.system, name, date, time, tz };
  // The full name at birth: required by numerology, kept with the person's details for the others.
  const birthName = String(b.birthName || "").replace(/\s+/g, " ").trim();
  if (birthName.length > 100) throw new ChartInputError("invalid birth name");
  if (birthName) inp.birthName = birthName;
  if (engine.SYSTEM.needsBirthName && !/[a-z]/i.test(birthName.normalize("NFD"))) throw new ChartInputError("invalid birth name");
  if (engine.SYSTEM.needsLocation) {
    const lat = Number(b.lat), lon = Number(b.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ChartInputError("invalid location");
    inp.lat = Math.round(lat * 1e4) / 1e4;
    inp.lon = Math.round(lon * 1e4) / 1e4;
  }
  return inp;
}


function computeChart(inp) {
  const engine = engines[inp.system];
  const utc = engine.toUTC(inp.date, inp.time, inp.tz);
  if (!utc) throw new ChartInputError("invalid time");
  const full = { ...inp, utc };
  const chart = engine.SYSTEM.compute(full);
  chart.input = full;
  return { engine, chart };
}

const plain = h => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const SYSTEM_PLAIN = { "gene-keys": "Gene Keys", "human-design": "Human Design", "natal": "Natal astrology", "vedic": "Vedic astrology", "numerology": "Numerology" };

// Everything the Career Reading needs from one system, calculated in that
// system's own isolated engine: the panel items (with the same prompts the
// guide uses), each tab's overview prompt, today's timing, the next `days` of
// forecast and the chart itself as HTML (the report turns it into text).
export function careerData(inp, days = 30) {
  const { engine, chart } = computeChart(inp);
  const S = engine.SYSTEM;
  const tabs = S.guide.tabs.map(t => ({
    key: t.key, name: t.name, blurb: t.blurb,
    overviewPrompt: t.overview ? t.overview(chart) : null,
    items: t.items(chart).map(it => ({ title: it.title, code: plain(it.code), sub: plain(it.sub), role: it.role || "", prompt: it.prompt })),
  }));
  return {
    system: inp.system, title: S.title, label: SYSTEM_PLAIN[inp.system],
    badges: (S.badges(chart) || []).map(b => ({ name: b.h, value: plain(b.p), mark: plain(b.n) })),
    header: S.header ? plain(S.header(chart)) : "",
    tabs,
    readingData: S.reading.data(chart),
    forecast: S.forecast ? S.forecast(chart, days) : [],
    chartHTML: S.chartHTML(chart) + (S.positionsHTML ? S.positionsHTML(chart) : ""),
  };
}
