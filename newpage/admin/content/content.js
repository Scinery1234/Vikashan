// The content editor. Every item is a collapsed card; opening one shows its
// fields. Save stores only what differs from the original (the server decides).
const $ = id => document.getElementById(id)
let token = null
try { token = sessionStorage.getItem('np_admin_token') } catch {}

const QNAME = { launch: 'Launch', unstick: 'Unstick', explore: 'Explore', recharge: 'Recharge' }
const TABS = [['launch', 'Launch'], ['unstick', 'Unstick'], ['explore', 'Explore'], ['recharge', 'Recharge'], ['library', 'Library'], ['plan', 'Emails']]
const S = { items: [], tab: 'launch', q: '' }

const el = (tag, text, attrs = {}, ...kids) => {
  const e = document.createElement(tag)
  if (text != null && text !== '') e.textContent = text
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v) }
  e.append(...kids.flat().filter(Boolean))
  return e
}

async function api(method, body) {
  const res = await fetch('/api/newpage/content', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) { needLogin(); throw new Error('Please sign in again.') }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}
function needLogin() { $('editor').hidden = true; $('need-login').hidden = false }

const edited = it => it.fields.some(f => f.edited)
const inTab = it => (S.tab === 'library' ? it.group === 'library' : S.tab === 'plan' ? it.group === 'plan' : it.group === 'program' && it.q === S.tab)
const text = it => [it.label, it.where, ...it.fields.map(f => (Array.isArray(f.value) ? f.value.join(' ') : String(f.value)))].join(' ').toLowerCase()
const count = tab => S.items.filter(it => edited(it) && (tab === 'library' ? it.group === 'library' : tab === 'plan' ? it.group === 'plan' : it.group === 'program' && it.q === tab)).length

function renderTabs() {
  const box = $('tabs'); box.replaceChildren()
  for (const [id, label] of TABS) {
    const n = count(id)
    box.append(el('button', label, { type: 'button', role: 'tab', class: 'ce-tab', 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; render() } }, n ? el('small', `${n}`) : null))
  }
}

function fieldInput(f, onChange) {
  if (f.type === 'int') return el('input', null, { type: 'number', min: '1', max: '240', value: f.value, 'aria-label': f.label, oninput: e => onChange(e.target.value) })
  if (f.type === 'text') return el('input', null, { type: 'text', maxlength: '300', value: f.value, 'aria-label': f.label, oninput: e => onChange(e.target.value) })
  const val = f.type === 'lines' ? f.value.join('\n') : f.value
  const rows = f.type === 'lines' ? Math.min(22, Math.max(6, f.value.length + 3)) : Math.min(12, Math.max(3, Math.ceil(String(val).length / 90)))
  const ta = el('textarea', null, { rows: String(rows), 'aria-label': f.label, oninput: e => onChange(e.target.value) })
  ta.value = val
  return ta
}

function card(it) {
  const draft = {}
  for (const f of it.fields) draft[f.name] = Array.isArray(f.value) ? f.value.join('\n') : f.value
  const badge = el('span', null, { class: 'badge' }); const sum = el('summary', null, {}, el('span', it.label), badge)
  const status = el('p', '', { class: 'small', role: 'status' })
  let dirty = false
  const paint = () => { badge.textContent = dirty ? 'Unsaved' : edited(it) ? 'Edited' : ''; badge.className = 'badge' + (dirty ? ' unsaved' : ''); badge.hidden = !badge.textContent }
  paint()
  const d = el('details', null, { class: 'ce-item' }, sum)
  let built = false
  d.addEventListener('toggle', () => { if (d.open && !built) { built = true; d.append(body()) } })
  function body() {
    const form = el('div', null, { class: 'ce-form' + (it.fields.length > 3 ? ' two' : '') })
    for (const f of it.fields) {
      const wrap = el('div', null, { class: 'field' }, el('label', f.label), fieldInput(f, v => { draft[f.name] = v; dirty = true; paint(); status.textContent = '' }))
      if (f.edited) wrap.append(el('details', null, { class: 'ce-orig' }, el('summary', 'Show the original'), el('pre', Array.isArray(f.base) ? f.base.join('\n') : String(f.base))))
      form.append(wrap)
    }
    const save = el('button', 'Save', { type: 'button', class: 'btn btn-primary', onclick: async () => {
      save.disabled = true; status.textContent = 'Saving…'
      try {
        const r = await api('POST', { key: it.key, values: draft })
        Object.assign(it, r.item); dirty = false; paint(); status.textContent = 'Saved. Live for new readers now.'
        renderTabs(); summary()
        d.replaceChildren(sum); built = false; d.open = false; d.open = true
      } catch (e) { status.textContent = e.message; status.className = 'small error' }
      save.disabled = false
    } })
    const reset = edited(it) ? el('button', 'Reset to original', { type: 'button', class: 'btn btn-secondary', onclick: async () => {
      if (!confirm('Put back the original text for this item?')) return
      try { const r = await api('POST', { key: it.key, reset: true }); Object.assign(it, r.item); dirty = false; paint(); renderTabs(); summary(); d.replaceChildren(sum); built = false; d.open = false; d.open = true } catch (e) { status.textContent = e.message }
    } }) : null
    return el('div', null, { class: 'ce-form' }, form, el('div', null, { class: 'ce-actions' }, save, reset, status))
  }
  return d
}

function summary() {
  const n = S.items.filter(edited).length
  $('summary').textContent = n ? `${n} item${n === 1 ? '' : 's'} edited so far.` : 'Nothing edited yet: everything shown is the original text.'
}

function render() {
  renderTabs(); summary()
  const list = $('list'); list.replaceChildren()
  const q = S.q.trim().toLowerCase()
  let items = S.items.filter(inTab)
  if (q) items = items.filter(it => text(it).includes(q))
  if (!items.length) { list.append(el('p', q ? 'Nothing matches that search.' : 'Nothing here.', { class: 'muted' })); return }

  if (S.tab === 'library') {
    for (const [g, label] of [['shared', 'For everyone'], ...Object.keys(QNAME).map(k => [k, `Only for ${QNAME[k]}`])]) {
      const part = items.filter(it => it.q === g); if (!part.length) continue
      list.append(el('div', null, { class: 'ce-group' }, el('h3', label), el('div', null, { class: 'ce-sub' }, part.map(card))))
    }
    return
  }
  const weeks = [0, 1, 2, 3]
  const groups = S.tab === 'plan' ? Object.keys(QNAME) : [S.tab]
  for (const g of groups) {
    const gi = items.filter(it => it.q === g); if (!gi.length) continue
    const wrap = el('div', null, { class: 'ce-group' }, S.tab === 'plan' ? el('h3', `${QNAME[g]}: the free plan and follow-up emails`) : null)
    for (const w of weeks) {
      const wi = gi.filter(it => it.week === w); if (!wi.length) continue
      const title = (wi.find(it => it.kind === 'week' || it.kind === 'plan') || wi[0]).fields.find(f => f.name === 'title')?.value || ''
      const n = wi.filter(edited).length
      const det = el('details', null, { class: 'ce-week' }, el('summary', null, {}, el('span', `${S.tab === 'plan' ? 'Emailed plan, w' : 'W'}eek ${w + 1}${title ? ': ' + title : ''}`), n ? el('span', `${n} edited`, { class: 'badge' }) : null),
        el('div', null, { class: 'ce-sub' }, wi.map(card)))
      if (q) det.open = true
      wrap.append(det)
    }
    const em = gi.filter(it => it.kind === 'email').sort((a, b) => a.day - b.day)
    if (em.length) wrap.append(emailGroup('Follow-up emails (sent in the weeks after the plan)', em))
    list.append(wrap)
  }
  if (S.tab === 'plan') {
    const prog = items.filter(it => it.q === 'program')
    if (prog.length) list.append(el('div', null, { class: 'ce-group' }, el('h3', 'Emails during the four weeks'), emailGroup('Weekly nudges, booking, renewal and check-in emails', prog)))
    const shared = items.filter(it => it.q === 'shared').sort((a, b) => a.day - b.day)
    if (shared.length) list.append(el('div', null, { class: 'ce-group' }, el('h3', 'Follow-up emails sent to every type'), emailGroup('Days 28, 35 and 42', shared)))
  }
}

function emailGroup(title, em) {
  const n = em.filter(edited).length
  const det = el('details', null, { class: 'ce-week' }, el('summary', null, {}, el('span', title), n ? el('span', `${n} edited`, { class: 'badge' }) : null), el('div', null, { class: 'ce-sub' }, em.map(card)))
  if (S.q.trim()) det.open = true
  return det
}

async function start() {
  if (!token) return needLogin()
  try {
    S.items = (await api('GET')).items
    $('editor').hidden = false
    render()
  } catch (e) { if (token) { $('editor').hidden = true; $('need-login').hidden = false; $('need-login').querySelector('p').textContent = e.message } }
}
$('q').addEventListener('input', e => { S.q = e.target.value; render() })
start()
