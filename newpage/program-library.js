// The New Page resource library: reference guides, scripts and question banks
// that members keep after the four weeks. Some are for everyone; some are
// written for one type. Same body format as the program readings:
// '## ' heading, '- ' bullet, anything else is a paragraph.
import { SHARED_LIBRARY } from './program-library-shared.js'
import { LIBRARY } from './program-library-types.js'

export { SHARED_LIBRARY, LIBRARY }
export const libraryFor = quadrant => [...SHARED_LIBRARY, ...(LIBRARY[quadrant] || [])]

// Reading time from the word count (about 170 words a minute), so the label is honest.
for (const l of [...SHARED_LIBRARY, ...Object.values(LIBRARY).flat()]) l.minutes = Math.max(2, Math.round(l.body.join(' ').split(/\s+/).length / 170))
