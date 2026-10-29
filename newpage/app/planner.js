// The planner: tasks with dates and time blocks, goals, and calendar export.
import { h, todayStr, addDays, fmtDay, addMinutes, download, ics, gcalUrl } from './ui.js'

const L = { newTask: '', due: '', start: '', mins: '30', goal: '', newGoal: '', goalDate: '', editing: null, showDone: false, err: '' }

export function plannerScreen(ctx) {
  const { S, act, render } = ctx
  const me = S.me
  const today = todayStr()
  const open = me.tasks.filter(t => !t.done)
  const byTime = (a, b) => (a.start || '99').localeCompare(b.start || '99')
  const groups = [
    ['Today and overdue', open.filter(t => t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due) || byTime(a, b))],
    ['This week', open.filter(t => t.due && t.due > today && t.due <= addDays(today, 7)).sort((a, b) => a.due.localeCompare(b.due) || byTime(a, b))],
    ['Later', open.filter(t => t.due && t.due > addDays(today, 7)).sort((a, b) => a.due.localeCompare(b.due))],
    ['No date yet', open.filter(t => !t.due)]
  ]
  const done = me.tasks.filter(t => t.done).slice(-10).reverse()
  const scheduled = open.filter(t => t.due)
  const goalName = id => me.goals.find(g => g.id === id)?.title

  const run = async (action, body) => { L.err = ''; try { await act(action, body) } catch (e) { L.err = e.message } render() }

  const row = t => {
    if (L.editing === t.id) return editRow(t)
    return h('div', { class: 'task plan-task' },
      h('label', {},
        h('input', { type: 'checkbox', checked: t.done, onchange: e => run('task_toggle', { id: t.id, done: e.target.checked }) }),
        h('span', { class: 't' }, t.title)),
      h('div', { class: 'meta' },
        t.start && h('span', { class: 'time' }, `${t.start}–${addMinutes(t.start, t.mins || 30)}`),
        t.due && h('span', { class: 'due' }, t.due < today ? `${fmtDay(t.due)} · overdue` : t.due === today ? 'Today' : fmtDay(t.due)),
        t.goalId && goalName(t.goalId) && h('span', { class: 'src' }, goalName(t.goalId)),
        t.source !== 'you' && h('span', { class: 'src' }, t.source),
        t.due && !t.done && h('a', { class: 'cal', href: gcalUrl(t), target: '_blank', rel: 'noopener', 'aria-label': `Add ${t.title} to Google Calendar` }, 'Google'),
        !t.done && h('button', { class: 'cal', type: 'button', onclick: () => { L.editing = t.id; render() } }, 'Edit')),
      h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${t.title}`, onclick: () => run('task_delete', { id: t.id }) }, '×'))
  }

  const editRow = t => {
    const e = { title: t.title, due: t.due || '', start: t.start || '', mins: String(t.mins || 30) }
    return h('form', { class: 'plan-edit', onsubmit: ev => {
      ev.preventDefault()
      L.editing = null
      run('task_update', { id: t.id, title: e.title, due: e.due || null, start: e.start || null, mins: Number(e.mins) })
    } },
      h('input', { type: 'text', maxlength: '200', value: e.title, 'aria-label': 'Task', oninput: ev => { e.title = ev.target.value } }),
      h('div', { class: 'when' },
        h('input', { type: 'date', value: e.due, 'aria-label': 'Date', oninput: ev => { e.due = ev.target.value } }),
        h('input', { type: 'time', value: e.start, 'aria-label': 'Start time', oninput: ev => { e.start = ev.target.value } }),
        minsSelect(e.mins, v => { e.mins = v })),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'), h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { L.editing = null; render() } }, 'Cancel')))
  }

  const addForm = h('form', { class: 'card plan-add', onsubmit: ev => {
    ev.preventDefault()
    const title = L.newTask.trim()
    if (!title) return
    const body = { title, due: L.due || null, start: L.due && L.start ? L.start : null, mins: Number(L.mins), goalId: L.goal || null }
    Object.assign(L, { newTask: '', start: '' })
    run('task_add', body)
  } },
    h('span', { class: 'label' }, 'Add a task'),
    h('input', { id: 'pl-title', type: 'text', maxlength: '200', placeholder: 'What will you do?', 'aria-label': 'Task', value: L.newTask, oninput: e => { L.newTask = e.target.value } }),
    h('div', { class: 'when' },
      h('label', {}, h('span', {}, 'Date'), h('input', { type: 'date', value: L.due, oninput: e => { L.due = e.target.value; render() } })),
      L.due && h('label', {}, h('span', {}, 'Start (optional)'), h('input', { type: 'time', value: L.start, oninput: e => { L.start = e.target.value; render() } })),
      L.due && L.start && h('label', {}, h('span', {}, 'Length'), minsSelect(L.mins, v => { L.mins = v })),
      me.goals.some(g => !g.done) && h('label', {}, h('span', {}, 'Goal'), h('select', { onchange: e => { L.goal = e.target.value } },
        h('option', { value: '' }, 'None'), me.goals.filter(g => !g.done).map(g => h('option', { value: g.id, selected: L.goal === g.id }, g.title))))),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add task'))

  const goalsCard = h('div', { class: 'card' },
    h('span', { class: 'label' }, 'Your goals'),
    me.goals.length ? me.goals.map(g => {
      const linked = me.tasks.filter(t => t.goalId === g.id), n = linked.filter(t => t.done).length
      return h('div', { class: 'task' },
        h('label', {}, h('input', { type: 'checkbox', checked: g.done, onchange: e => run('goal_toggle', { id: g.id, done: e.target.checked }) }), h('span', { class: 't' }, g.title)),
        linked.length > 0 && h('span', { class: 'due' }, `${n}/${linked.length} tasks`),
        g.target && h('span', { class: 'due' }, `by ${fmtDay(g.target)}`),
        h('button', { class: 'x', type: 'button', 'aria-label': `Delete goal ${g.title}`, onclick: () => run('goal_delete', { id: g.id }) }, '×'))
    }) : h('p', { class: 'muted small' }, 'A goal is something bigger than a task, like “Apply for 5 roles”. Add one, then link tasks to it.'),
    h('form', { class: 'add-row goal-row', onsubmit: ev => { ev.preventDefault(); const title = L.newGoal.trim(); if (!title) return; const body = { title, target: L.goalDate || null }; Object.assign(L, { newGoal: '', goalDate: '' }); run('goal_add', body) } },
      h('input', { id: 'pl-goal', type: 'text', maxlength: '200', placeholder: 'Add a goal…', 'aria-label': 'New goal', value: L.newGoal, oninput: e => { L.newGoal = e.target.value } }),
      h('input', { type: 'date', 'aria-label': 'Target date (optional)', value: L.goalDate, oninput: e => { L.goalDate = e.target.value }, class: 'goal-date' }),
      h('button', { class: 'btn btn-secondary', type: 'submit' }, 'Add')))

  return h('section', { class: 'screen' },
    h('div', {}, h('button', { class: 'link-btn back', type: 'button', onclick: () => ctx.go('tools') }, '← Tools'), h('h2', {}, 'Planner'),
      h('p', { class: 'muted' }, 'Tasks, time blocks and goals. Sky can add to this list too.')),
    L.err && h('p', { class: 'error', role: 'alert' }, L.err),
    h('div', { class: 'plan-cols' }, h('div', { class: 'col-a' }, addForm,
    groups.map(([title, list]) => list.length > 0 && h('div', { class: 'card' }, h('span', { class: 'label' }, title), h('div', { class: 'tasks' }, list.map(row)))),
    !open.length && h('p', { class: 'muted' }, 'Nothing open. Add the next small thing you’ll do.')),
    h('div', { class: 'col-b' },
    scheduled.length > 0 && h('div', { class: 'card' },
      h('span', { class: 'label' }, 'Put it in your calendar'),
      h('p', { class: 'small muted' }, 'Add one task with its “Google” link, or download everything that has a date as a file for Apple, Outlook or any calendar. Your calendar copy won’t update if you change a task here.'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => download('new-page-planner.ics', ics(scheduled), 'text/calendar') }, `Download ${scheduled.length} dated task${scheduled.length === 1 ? '' : 's'} (.ics)`)),
    goalsCard,
    done.length > 0 && h('div', { class: 'card' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => { L.showDone = !L.showDone; render() } }, L.showDone ? 'Hide finished tasks' : `Show ${done.length} finished task${done.length === 1 ? '' : 's'}`),
      L.showDone && h('div', { class: 'tasks' }, done.map(row))),
    h('div', { class: 'card' },
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: me.member.reminders, onchange: e => run('reminders_set', { on: e.target.checked }) }),
        h('span', {}, 'Email me each morning when I have something due')),
      h('p', { class: 'small muted' }, 'Around 7am Sydney time, only on days with something due.')))))
}

function minsSelect(value, on) {
  return h('select', { 'aria-label': 'Length', onchange: e => on(e.target.value) },
    [15, 30, 45, 60, 90, 120].map(m => h('option', { value: String(m), selected: String(m) === String(value) }, m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ' 30' : ''}`)))
}
