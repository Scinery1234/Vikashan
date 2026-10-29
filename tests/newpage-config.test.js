import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('long jobs (resume, cover letter, Sky) are allowed to run for a minute, not the default 10 seconds', () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'))
  assert.ok(v.functions['api/newpage/app.js'].maxDuration >= 60)
  assert.ok(v.functions['api/newpage/docx.py'].maxDuration >= 30)
  assert.match(v.functions['api/newpage/docx.py'].includeFiles, /api\/_py/)
  assert.ok(v.crons.some(c => c.path === '/api/newpage/retention'))
})

test('the Python function has what it needs to install', () => {
  const r = readFileSync('requirements.txt', 'utf8')
  assert.match(r, /python-docx/); assert.match(r, /pypdf/)
})

test('the resume file picker has no accept filter (phones can offer only the camera), and there is one style', () => {
  for (const f of ['newpage/app/resume.js', 'newpage/app/context.js']) {
    const s = readFileSync(f, 'utf8')
    assert.ok(!/type: 'file'[^}]*accept/.test(s), `${f}: no accept attribute on the file input`)
    assert.ok(!/templatePicker|tmpl-opt/.test(s), `${f}: no style picker`)
  }
  assert.ok(!/templatePicker/.test(readFileSync('newpage/app/cover.js', 'utf8')))
})
