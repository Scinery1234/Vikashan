"""HTML preview of the approved resume, laid out like the Word file."""
from html import escape


def _join(*parts, sep=" | "):
    return sep.join(escape(p) for p in parts if p)


def preview_html(data):
    c = data["candidate"]
    out = ['<div class="ra-page">', f'<h1>{escape(c["full_name"].upper())}</h1>']
    if c["generic_job_title"]:
        out.append(f'<p class="ra-title">{escape(c["generic_job_title"])}</p>')
    contact = _join(c["location"], c["phone"], c["email"])
    if contact:
        out.append(f'<p class="ra-centre">{contact}</p>')
    if c["linkedin"]:
        out.append(f'<p class="ra-centre">{escape(c["linkedin"])}</p>')

    def heading(t):
        out.append(f"<h2>{escape(t.upper())}</h2>")

    def bullets(items):
        out.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>")

    if data["professional_summary"]:
        heading("Professional Summary")
        out.append(f'<p>{escape(data["professional_summary"])}</p>')
    if data["key_skills"]:
        heading("Key Skills")
        bullets(escape(s) for s in data["key_skills"])
    if data["professional_experience"]:
        heading("Professional Experience")
        for r in data["professional_experience"]:
            out.append(f'<p class="ra-role"><b>{_join(r["job_title"], r["employer"], r["location"])}</b></p>')
            dates = " to ".join(x for x in (r["start_date"], r["end_date"]) if x)
            if dates:
                out.append(f"<p>{escape(dates)}</p>")
            if r["scope_statement"]:
                out.append(f'<p><i>{escape(r["scope_statement"])}</i></p>')
            if r["achievements"]:
                bullets(escape(a) for a in r["achievements"])
    if data["education_and_training"]:
        heading("Education and Training")
        for e in data["education_and_training"]:
            out.append(f'<p>{_join(e["qualification"], e["institution"], e["location"], e["completion_date"])}</p>')
            if e["details"]:
                out.append(f'<p>{escape(e["details"])}</p>')
    if data["awards"]:
        heading("Awards")
        bullets(_join(a["award_name"], a["issuing_organisation"], a["year"], sep=", ") + (f'. {escape(a["details"])}' if a["details"] else "") for a in data["awards"])
    if data["certifications"]:
        heading("Certifications")
        bullets(_join(x["certification_name"], x["issuing_body"], x["year_obtained"], f'expires {x["expiry_date"]}' if x["expiry_date"] else "", sep=", ") for x in data["certifications"])
    if data["technical_skills"]:
        heading("Technical Skills")
        bullets(f'<b>{escape(g["category"])}:</b> {escape(", ".join(g["skills"]))}' if g["category"] else escape(", ".join(g["skills"])) for g in data["technical_skills"])
    if data["additional_information"]:
        heading("Additional Information")
        bullets(f'<b>{escape(i["category"])}:</b> {escape(i["details"])}' if i["category"] else escape(i["details"]) for i in data["additional_information"])
    out.append("</div>")
    css = ("<style>.ra-page{font-family:Calibri,Carlito,Arial,sans-serif;font-size:11pt;color:#000;background:#fff;"
           "padding:1.5cm 1.7cm;line-height:1.2}.ra-page h1{font-size:22pt;text-align:center;margin:0}"
           ".ra-page .ra-title{font-size:12pt;font-weight:bold;text-align:center}.ra-page .ra-centre{text-align:center}"
           ".ra-page h2{font-size:11pt;margin:10pt 0 3pt;border-bottom:1px solid #000;padding-bottom:1px}"
           ".ra-page p{margin:0}.ra-page .ra-role{margin-top:8pt}.ra-page ul{margin:0;padding-left:0.5cm}</style>")
    return "<!doctype html><html><head><meta charset='utf-8'>" + css + "</head><body>" + "".join(out) + "</body></html>"
