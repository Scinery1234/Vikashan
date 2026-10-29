// The resume and cover letter writers (see resume.js and cover.js).
import { resumeScreen } from './resume.js'
import { coverScreen } from './cover.js'

export const docsScreen = (ctx, kind) => (kind === 'resume' ? resumeScreen(ctx) : coverScreen(ctx))
