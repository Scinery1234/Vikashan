// Turns a chart page's HTML into plain Markdown: headings, tables, notes and
// key-value lists. Images (the wheel, the bodygraph) are dropped; the tables
// carry the same data.
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const text = h => String(h || "")
  .replace(/<br\s*\/?>/gi, " · ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => ENT[m])
  .replace(/[︎️]/g, "")
  .replace(/\s+/g, " ").trim();
const cell = h => text(h).replace(/\|/g, "\\|") || " ";

function table(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/gi)].map(c => ({ head: c[1] === "h", v: cell(c[2]) })));
  if (!rows.length) return "";
  const head = rows[0].every(c => c.head) ? rows.shift().map(c => c.v) : rows[0].map(() => " ");
  const width = Math.max(head.length, ...rows.map(r => r.length));
  const pad = r => [...r, ...Array(width - r.length).fill(" ")];
  return [
    "| " + pad(head).join(" | ") + " |",
    "|" + pad(head).map(() => "---").join("|") + "|",
    ...rows.map(r => "| " + pad(r.map(c => c.v)).join(" | ") + " |"),
  ].join("\n");
}

export function chartToMarkdown(html) {
  let h = String(html || "")
    .replace(/\son\w+="[^"]*"/gi, "")          // inline handlers can contain ">"
    .replace(/<button[\s\S]*?<\/button>/gi, "")  // view switchers, not data
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<span class="eph-toggle"[\s\S]*?<\/span>/gi, "");
  const blocks = [];
  const keep = s => { blocks.push(s); return `\n@@${blocks.length - 1}@@\n`; };
  h = h.replace(/<table[\s\S]*?<\/table>/gi, t => keep(table(t)));
  h = h.replace(/<h3[^>]*>([\s\S]*?)(?:<small>([\s\S]*?)<\/small>)?<\/h3>/gi, (_, t, small) => keep("#### " + text(t) + (small ? " · " + text(small) : "")));
  h = h.replace(/<dl[^>]*>([\s\S]*?)<\/dl>/gi, (_, d) => keep([...d.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)].map(m => "- **" + text(m[1]) + ":** " + text(m[2])).join("\n")));
  h = h.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, p) => keep(text(p)));
  h = h.replace(/<div class="badge">([\s\S]*?)<\/div>\s*<\/div>/gi, (_, b) => keep("- " + text(b)));
  return h.split(/\n/).map(l => {
    const m = l.match(/^@@(\d+)@@$/);
    if (m) return blocks[+m[1]];
    const t = text(l);
    return t ? t : "";
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
