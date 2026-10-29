// "Meet Sky": a panel that slides in from the right (up from the bottom on a
// phone) explaining Sky, the AI Coach, and its nine focus areas. It is also the
// focus picker, so the chat itself stays uncluttered. Opens on its own the
// first time someone visits the Coach tab.
import { h } from './ui.js'
import { focusIcon } from './icons.js'

const SEEN = 'np_sky_seen'
export const skySeen = () => { try { return !!localStorage.getItem(SEEN) } catch { return true } }
const markSeen = () => { try { localStorage.setItem(SEEN, '1') } catch {} }

let wrap = null, back = null, onKey = null

export function closeSky() {
  if (!wrap) return
  wrap.classList.remove('open')
  const w = wrap
  setTimeout(() => w.remove(), 220)
  document.removeEventListener('keydown', onKey)
  document.body.classList.remove('no-scroll')
  wrap = null
  markSeen()
  back?.focus?.()
}

export function openSky(ctx) {
  if (wrap) return
  back = document.activeElement
  const { coaches } = ctx.S.me
  const current = ctx.S.coach
  const close = () => closeSky()
  const focusCard = c => h('li', { class: 'focus-card' + (c.id === current ? ' on' : '') },
    h('div', { class: 'fc-head' }, focusIcon(c.id, 40), h('h3', {}, c.name), c.id === current && h('span', { class: 'pill' }, 'Current')),
    h('p', {}, c.blurb),
    h('dl', { class: 'fc-info' }, h('dt', {}, 'Good for'), h('dd', {}, c.when), h('dt', {}, 'How it works'), h('dd', {}, c.how)),
    h('button', { class: c.id === current ? 'btn btn-secondary' : 'btn btn-primary', type: 'button', onclick: () => { close(); ctx.setFocus(c.id) } }, c.id === current ? 'Keep this focus' : `Talk about ${c.name.toLowerCase()}`))
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sky-title' },
    h('div', { class: 'drawer-head' },
      h('div', {}, h('span', { class: 'note' }, 'your AI Coach'), h('h2', { id: 'sky-title' }, 'Meet Sky')),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close', id: 'sky-close', onclick: close }, '×')),
    h('div', { class: 'drawer-body' },
      h('p', {}, 'Sky is an AI coach. Pick a focus below for the kind of conversation you need. Sky keeps one memory and one task list across all of them, so you never have to repeat yourself.'),
      !ctx.S.me.member.privacy && h('div', { class: 'tool-callout' },
        h('div', {}, h('b', {}, 'Set up Sky (2 minutes)'), h('p', { class: 'small' }, 'Choose what Vik can see, add your resume and tell Sky about you. Sky keeps notes as you chat, so you never repeat yourself.')),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { close(); ctx.go('tools', 'context') } }, 'Set up Sky')),
      h('ul', { class: 'sky-facts' },
        h('li', {}, 'Sky is an AI. It is not Vik, and it can’t replace your 60-minute session with him.'),
        h('li', {}, 'It’s coaching, not therapy. If things get heavy, Lifeline is on 13 11 14, any time.'),
        h('li', {}, 'Sky keeps notes as you chat, without asking. You can see, edit and delete them in Your context, and you choose what Vik can see.')),
      h('ul', { class: 'focus-list' }, coaches.map(focusCard))))
  back = back || document.body
  const opener = back
  wrap = h('div', { class: 'drawer-wrap' }, h('div', { class: 'drawer-back', onclick: close }), panel)
  document.body.append(wrap)
  document.body.classList.add('no-scroll')
  back = opener
  requestAnimationFrame(() => { wrap?.classList.add('open'); document.getElementById('sky-close')?.focus() })
  onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key !== 'Tab' || !wrap) return
    const els = [...panel.querySelectorAll('button')]
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  document.addEventListener('keydown', onKey)
}
