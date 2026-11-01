// Small icons for Sky's nine focus areas. The markup below is fixed text, never
// anything a member typed.
const PATHS = {
  career: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  recovery: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  action: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  exec: '<path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
  charge: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  cbt: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
  interview: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  offer: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 14l2 2 4-4"/>',
  clarity: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'
}
const TINT = { career: '#E3ECFB', recovery: '#E8E3FB', action: '#FFF1C9', exec: '#DDF4EA', charge: '#FBE3E8', cbt: '#DCF1FA', interview: '#FDE7D6', offer: '#E9F5D2', clarity: '#D9EEF0' }

export function focusIcon(id, size = 36) {
  const wrap = document.createElement('span')
  wrap.className = 'focus-icon'
  wrap.style.setProperty('--tint', TINT[id] || '#EEF2F9')
  wrap.style.setProperty('--size', `${size}px`)
  wrap.setAttribute('aria-hidden', 'true')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.innerHTML = PATHS[id] || PATHS.career
  wrap.append(svg)
  return wrap
}
