// Your context: everything Sky knows about you, and who can see it. Sky keeps
// notes as you chat without asking. This screen is where you see them, change
// them, choose what Vik can see, and download or delete it all.
import { h, download } from './ui.js'
import { fileToB64, resumeFileProblem } from './docfiles.js'

let stale = true
// Called when the screen is opened, so notes Sky kept in the meantime show up.
export const markContextStale = () => { stale = true }
const L = { c: null, loading: false, err: '', msg: '', about: null, resumeText: null, notesDraft: '', editing: null, editText: '', note: '', confirmDelete: false, busy: '', shareNote: '', uploading: false }

const fmt = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

async function load(ctx, force) {
  if ((L.c && !force) || L.loading) { if (force && L.loading) stale = true; return }
  L.loading = true
  try { L.c = await ctx.call('/api/newpage/app', { action: 'context_get' }); L.about = { ...L.c.about }; L.resumeText = L.c.resume.text } catch (e) { L.err = e.message }
  L.loading = false
  ctx.render()
}

async function run(ctx, action, body = {}, done = '') {
  L.err = ''; L.msg = ''
  try {
    const r = await ctx.call('/api/newpage/app', { action, ...body })
    if (r.questions) { L.c = r; L.about = { ...r.about }; L.resumeText = r.resume.text }
    L.msg = done
    await ctx.act('me').catch(() => {})
    return r
  } catch (e) { L.err = e.message }
}

export function contextScreen(ctx) {
  if (stale) { stale = false; load(ctx, true) } else load(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('span', { class: 'note' }, 'your privacy'), h('h2', {}, 'Your context'),
    h('p', { class: 'muted' }, 'What Sky knows about you, and who can see it. Sky keeps notes as you chat, without asking, so you never repeat yourself. It’s all stored encrypted, and you’re in charge of it.'))
  const c = L.c
  if (!c) return h('section', { class: 'screen' }, head, L.err ? h('p', { class: 'error', role: 'alert' }, L.err) : h('p', { class: 'loading' }, 'Loading…'))

  const status = (L.err || L.msg) && h('p', { class: L.err ? 'error' : 'small', role: L.err ? 'alert' : 'status' }, L.err || L.msg)

  // 1. Who can see what
  const privacy = h('div', { class: 'card' },
    h('span', { class: 'label' }, '1. What can Vik see?'),
    h('p', { class: 'small muted' }, 'Sky always uses what it knows to coach you. This is about Vik, your human coach.'),
    h('div', { class: 'radios', role: 'radiogroup', 'aria-label': 'What Vik can see' }, ['private', 'share', 'all'].map(k => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(c.privacy === k), class: 'radio-card' + (c.privacy === k ? ' on' : ''),
      onclick: async () => { await run(ctx, 'privacy_set', { level: k }, 'Saved.'); ctx.render() }
    }, h('b', {}, c.privacyText[k].title), h('span', {}, c.privacyText[k].body)))),
    !c.privacy && h('p', { class: 'small' }, 'Until you choose, Vik can see nothing.'),
    c.views.length > 0 && h('p', { class: 'small muted' }, `Vik last looked at ${c.views[0].what} on ${fmt(c.views[0].created_at)}.`),
    c.privacy && c.views.length === 0 && c.privacy !== 'private' && h('p', { class: 'small muted' }, 'Vik hasn’t looked at anything yet. When he does, it shows here.'))

  // 2. Share with Vik
  const share = ['share', 'all'].includes(c.privacy) && h('div', { class: 'card' },
    h('span', { class: 'label' }, 'Share with Vik'),
    c.privacy === 'all' ? h('p', { class: 'small' }, 'Vik can already read your chats and what Sky has learned, so there’s nothing to share. Choose “Only what I share” if you’d rather decide each time.')
      : [h('p', { class: 'small' }, 'Send Vik a copy of what Sky knows about you: your answers, resume and notes. To share a chat, use “Share this chat with Vik” in the Coach tab.'),
        h('div', { class: 'field' }, h('label', { for: 'sh-note' }, 'A note for Vik (optional)'), h('input', { id: 'sh-note', type: 'text', maxlength: '300', value: L.shareNote, oninput: e => { L.shareNote = e.target.value } })),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => { await run(ctx, 'share_context', { note: L.shareNote }, 'Shared with Vik.'); L.shareNote = ''; ctx.render() } }, 'Share my context with Vik')],
    c.shares.length > 0 && h('div', {}, h('span', { class: 'label' }, 'What you’ve shared'),
      c.shares.map(s => h('div', { class: 'mem' }, h('span', {}, `${s.kind === 'chat' ? 'A chat' : 'Your context'} · ${fmt(s.created_at)}`), h('button', { class: 'link-btn blue', type: 'button', onclick: async () => { await run(ctx, 'share_delete', { id: s.id }, 'Taken back.'); ctx.render() } }, 'Take back')))))

  // 3. Resume
  const fileInput = h('input', { type: 'file', id: 'cx-file', class: 'sr-only', onchange: async e => {
    const f = e.target.files[0]; if (!f) return
    const problem = resumeFileProblem(f)
    if (problem) { L.err = problem; ctx.render(); return }
    L.uploading = true; L.err = ''; ctx.render()
    try { const d = await ctx.call('/api/newpage/docx', { token: ctx.token(), action: 'extract', filename: f.name, file: await fileToB64(f) }); L.resumeText = d.text } catch (er) { L.err = er.code || er.status < 500 ? er.message : 'We couldn’t read that file just now. Paste your resume text instead, or try again in a minute.' }
    L.uploading = false; ctx.render()
  } })
  const resume = h('div', { class: 'card' },
    h('span', { class: 'label' }, '2. Your resume'),
    h('p', { class: 'small muted' }, 'Upload a Word or PDF file (on a phone, pick it from Files), or paste it, so Sky knows your background. You can replace or delete it any time.'),
    h('div', { class: 'row' }, fileInput, h('label', { for: 'cx-file', class: 'btn btn-secondary' }, L.uploading ? 'Reading your file…' : c.resume.has ? 'Upload a different file' : 'Upload your resume')),
    h('div', { class: 'field' }, h('label', { for: 'cx-resume', class: 'sr-only' }, 'Your resume text'), h('textarea', { id: 'cx-resume', rows: '6', maxlength: '12000', placeholder: 'Or paste your resume here', oninput: e => { L.resumeText = e.target.value } }, L.resumeText || '')),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', type: 'button', disabled: !(L.resumeText || '').trim() || !c.ready, onclick: async () => { try { await ctx.call('/api/newpage/app', { action: 'tool_save', tool: 'profile', data: { text: L.resumeText } }); await load(ctx, true); L.msg = 'Resume saved.' } catch (e) { L.err = e.message } ctx.render() } }, 'Save resume'),
      c.resume.has && h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => { await run(ctx, 'resume_delete', {}, 'Resume deleted.'); ctx.render() } }, 'Delete it')))

  // 4. About you
  const set = (id, v) => { L.about[id] = v }
  const field = q => {
    const id = `ab-${q.id}`
    const input = q.type === 'select'
      ? h('select', { id, onchange: e => set(q.id, e.target.value) }, h('option', { value: '' }, 'Choose…'), q.options.map(o => h('option', { value: o, ...(L.about[q.id] === o ? { selected: '' } : {}) }, o)))
      : q.type === 'text' ? h('input', { id, type: 'text', maxlength: String(q.max || 200), value: L.about[q.id] || '', oninput: e => set(q.id, e.target.value) })
        : h('textarea', { id, rows: '3', maxlength: String(q.max || 500), oninput: e => set(q.id, e.target.value) }, L.about[q.id] || '')
    return h('div', { class: 'field' }, h('label', { for: id }, q.label), q.hint && h('p', { class: 'small muted' }, q.hint), input)
  }
  const about = h('div', { class: 'card' },
    h('span', { class: 'label' }, '3. About you'),
    h('p', { class: 'small muted' }, 'All optional. The more Sky knows, the less you have to explain.'),
    c.questions.map(field),
    h('button', { class: 'btn btn-primary', type: 'button', disabled: !c.ready, onclick: async () => { await run(ctx, 'about_save', { about: L.about }, 'Saved.'); ctx.render() } }, 'Save my answers'))

  // 5. What Sky has learned
  const notes = h('div', { class: 'card' },
    h('span', { class: 'label' }, `4. What Sky has learned (${c.notes.length} of ${c.limit})`),
    h('label', { class: 'check', for: 'cx-learn' }, h('input', { id: 'cx-learn', type: 'checkbox', ...(c.learn ? { checked: '' } : {}), onchange: async e => { await run(ctx, 'learn_set', { on: e.target.checked }, e.target.checked ? 'Sky will keep notes as you chat.' : 'Sky will stop keeping new notes.'); ctx.render() } }), h('span', {}, 'Let Sky keep notes as we chat')),
    c.notes.length === 0 && h('p', { class: 'small muted' }, 'Nothing yet. As you talk, Sky keeps short notes on what matters: your goals, strengths, limits and decisions. You’ll see them here.'),
    c.notes.map(n => L.editing === n.id
      ? h('form', { class: 'add-row', onsubmit: async e => { e.preventDefault(); await run(ctx, 'memory_edit', { id: n.id, note: L.editText }, 'Saved.'); L.editing = null; ctx.render() } }, h('input', { type: 'text', maxlength: '300', 'aria-label': 'Edit note', value: L.editText, oninput: e => { L.editText = e.target.value } }), h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Save'))
      : h('div', { class: 'mem' }, h('span', {}, n.note),
        h('button', { class: 'link-btn blue', type: 'button', 'aria-label': `Edit: ${n.note}`, onclick: () => { L.editing = n.id; L.editText = n.note; ctx.render() } }, 'Edit'),
        h('button', { class: 'x', type: 'button', 'aria-label': `Delete: ${n.note}`, onclick: async () => { await run(ctx, 'memory_delete', { id: n.id }); await load(ctx, true); ctx.render() } }, '×'))),
    h('form', { class: 'add-row', onsubmit: async e => { e.preventDefault(); if (!L.notesDraft.trim()) return; await run(ctx, 'memory_add', { note: L.notesDraft }, 'Added.'); L.notesDraft = ''; ctx.render() } },
      h('input', { type: 'text', maxlength: '300', placeholder: 'Tell Sky something to remember', 'aria-label': 'Add a note', value: L.notesDraft, oninput: e => { L.notesDraft = e.target.value } }), h('button', { class: 'btn btn-secondary', type: 'submit', disabled: !c.ready }, 'Add')))

  // 6. Your data
  const data = h('div', { class: 'card' },
    h('span', { class: 'label' }, '5. Your data'),
    h('p', { class: 'small' }, 'Sky’s memory is encrypted with a key just for you. If your membership ends, we keep it for 30 days (emailing you at 7, 14 and 30 days), then move it to the Trash for 12 months, then delete it for good. Coming back restores it.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => { try { const { export: ex } = await ctx.call('/api/newpage/app', { action: 'data_export' }); download('sky-memory.json', JSON.stringify(ex, null, 2), 'application/json'); L.msg = 'Downloaded.' } catch (e) { L.err = e.message } ctx.render() } }, 'Download everything'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => {
        if (!L.confirmDelete) { L.confirmDelete = true; L.msg = 'This deletes your chats, Sky’s notes, resume, answers and shares for good. Download a copy first if you want one.'; ctx.render(); return }
        L.confirmDelete = false; await run(ctx, 'data_delete', { confirm: true }, 'Everything was deleted.'); ctx.render()
      } }, L.confirmDelete ? 'Tap again to delete everything' : 'Delete everything')))

  return h('section', { class: 'screen ctx' }, head,
    !c.ready && h('p', { class: 'soft', role: 'alert' }, 'Private storage isn’t set up yet, so Sky can’t keep notes, and these answers can’t be saved. Everything else works.'),
    status,
    h('div', { class: 'ctx-cols' }, h('div', {}, privacy, share, data), h('div', {}, resume, about, notes)))
}
