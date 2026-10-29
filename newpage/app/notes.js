// Notes: a private place to type and work things out. Templates from the
// program open here too. Notes are saved as you type. Sky and Vik cannot read
// them.
import { h } from './ui.js'

const N = { notes: null, cur: null, loading: false, err: '', status: '', timer: null, view: 'list' }

const fmt = s => new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
const current = () => N.notes?.find(n => n.id === N.cur) || null
const blank = n => !n.title.trim() && !n.body.trim()

async function load(ctx) {
  if (N.notes !== null || N.loading) return
  N.loading = true
  try { N.notes = (await ctx.call('/api/newpage/app', { action: 'note_list' })).notes } catch (e) { N.notes = []; N.err = e.message }
  N.loading = false
  if (N.notes.length && !N.cur && window.matchMedia('(min-width: 900px)').matches) N.cur = N.notes[0].id
  ctx.render()
}

async function save(ctx, n) {
  clearTimeout(N.timer); N.timer = null
  if (!n || n.saved) return
  N.status = 'Saving…'
  try {
    const { note } = await ctx.call('/api/newpage/app', { action: 'note_save', id: n.id, title: n.title, body: n.body })
    n.updated_at = note.updated_at; n.saved = true
    N.status = 'Saved'
  } catch (e) { N.status = ''; N.err = e.message }
  const el = document.getElementById('note-status'); if (el) el.textContent = N.status
}

export async function flushNotes(ctx) {
  const n = current()
  if (n && !n.saved) await save(ctx, n)
}

// "Work on this in Notes": a template becomes a new note.
export async function noteFrom(ctx, title, body) {
  await load(ctx)
  try {
    const { note } = await ctx.call('/api/newpage/app', { action: 'note_save', title, body })
    N.notes = [{ ...note, saved: true }, ...(N.notes || [])]
    N.cur = note.id; N.view = 'edit'
  } catch (e) { N.err = e.message }
  ctx.go('tools', 'notes')
}

export function notesScreen(ctx) {
  load(ctx)
  const head = h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: async () => { await flushNotes(ctx); ctx.go('tools') } }, '← Tools'), h('h2', {}, 'Notes'),
    h('p', { class: 'muted' }, 'A private place to type and work things out. It saves as you go. Sky and Vik can’t read your notes.'))
  if (N.notes === null) return h('section', { class: 'screen' }, head, h('p', { class: 'loading' }, 'Loading…'))

  const add = async () => {
    await flushNotes(ctx)
    try {
      const { note } = await ctx.call('/api/newpage/app', { action: 'note_save', title: '', body: '' })
      N.notes = [{ ...note, saved: true }, ...N.notes]; N.cur = note.id; N.view = 'edit'; N.err = ''
    } catch (e) { N.err = e.message }
    ctx.render()
    document.getElementById('note-title')?.focus()
  }
  const open = async id => { await flushNotes(ctx); N.cur = id; N.view = 'edit'; N.status = ''; ctx.render() }

  const n = current()
  const list = h('div', { class: 'card notes-list' },
    h('div', { class: 'notes-top' }, h('span', { class: 'label' }, `Your notes (${N.notes.length})`), h('button', { class: 'btn btn-primary', type: 'button', onclick: add }, 'New note')),
    N.notes.length === 0 && h('p', { class: 'muted small' }, 'Nothing here yet. Start a note, or open a template from your program and work on it here.'),
    h('ul', { class: 'note-items' }, N.notes.map(x => h('li', {}, h('button', { class: 'note-item' + (x.id === N.cur ? ' on' : ''), type: 'button', onclick: () => open(x.id) },
      h('b', {}, x.title.trim() || 'Untitled'), h('small', {}, `${fmt(x.updated_at)} · ${(x.body.trim().split('\n')[0] || 'Empty').slice(0, 60)}`))))))

  const onType = () => {
    n.saved = false; N.status = ''
    const el = document.getElementById('note-status'); if (el) el.textContent = ''
    clearTimeout(N.timer); N.timer = setTimeout(() => save(ctx, n), 900)
  }
  const editor = n ? h('div', { class: 'card note-editor' },
    h('button', { class: 'link-btn back note-back', type: 'button', onclick: async () => { await flushNotes(ctx); N.view = 'list'; ctx.render() } }, '← All notes'),
    h('div', { class: 'field' }, h('label', { for: 'note-title', class: 'sr-only' }, 'Title'), h('input', { id: 'note-title', type: 'text', maxlength: '120', placeholder: 'Title', value: n.title, oninput: e => { n.title = e.target.value; onType() } })),
    h('div', { class: 'field' }, h('label', { for: 'note-body', class: 'sr-only' }, 'Your note'), h('textarea', { id: 'note-body', maxlength: '30000', placeholder: 'Type here…', oninput: e => { n.body = e.target.value; onType() } }, n.body)),
    h('div', { class: 'note-foot' },
      h('span', { id: 'note-status', class: 'small muted', role: 'status' }, N.status),
      h('button', { class: 'link-btn', type: 'button', onclick: async () => {
        if (!N.confirmDel) { N.confirmDel = true; ctx.render(); return }
        N.confirmDel = false
        try { await ctx.call('/api/newpage/app', { action: 'note_delete', id: n.id }); N.notes = N.notes.filter(x => x.id !== n.id); N.cur = null; N.view = 'list' } catch (e) { N.err = e.message }
        ctx.render()
      } }, N.confirmDel ? 'Tap again to delete this note' : 'Delete note')))
    : h('div', { class: 'docs-empty muted small' }, 'Choose a note, or start a new one.')

  return h('section', { class: 'screen notes' + (N.view === 'edit' && n ? ' show-editor' : ''), }, head, N.err && h('p', { class: 'error', role: 'alert' }, N.err), h('div', { class: 'notes-cols' }, list, editor))
}

window.addEventListener('pagehide', () => {
  const n = current()
  if (n && !n.saved && window.__npCtx) window.__npCtx.beacon('/api/newpage/app', { action: 'note_save', id: n.id, title: n.title, body: n.body })
})
