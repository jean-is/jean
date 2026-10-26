// Settings' Routines (D122, D509): what runs next and what waits for the user, then each routine with when it
// runs in words, how its last run went and its switch; a row opens its page, routines/<ulid>, with Run now, its
// request, when, who answers, its runs as each went, and Delete; routines/new makes one. Loaded the first time
// Settings shows Routines; its routines and their last runs are read again as it is entered, a page opened or a run ends.
import { html, nothing } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { app, brainsHere, openConversation } from '../../ui/state.js'
import { act } from '../../ui/acts.js'
import { sectionOpen, pageOpen } from '../../ui/dialogs.js'
import { choices } from '../../ui/picker.js'
import { loadConversation } from '../../core/conversations.js'
import { routineOf, unanswered } from '../../core/events.js'
import { t, relativeTime, intlLocales } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { EVERY, WHEN, newRoutine, schedule, trigger, writeRoutine } from './schedule.js'
import { folder, next, routines, runNow, runsOf, week } from './routines.js'

/** @typedef {import('./schedule.js').Routine} Routine */
/** When a routine runs, or what sets it off, as the page changes it. @typedef {{ every?: string, on?: number | string, at?: string, when?: string, if?: string }} Plan */
/** What a run's file says of it: how it began, whether an answer came, whether it waits for the user. @typedef {{ due?: string, asked?: boolean, file?: string, answered: boolean, waits: boolean }} Facts */

const list = signal(/** @type {Routine[] | null} */ (null))
/** Each routine's newest run, and the open one's last ten, by the run's file. */
const facts = signal(/** @type {Map<string, Facts>} */ (new Map()))
/** A routine being made, on routines/new. */
const draft = signal(/** @type {Plan & { title: string, request: string }} */ ({ title: '', request: '', every: 'day', at: '09:00' }))

/** Ready-made routines (D628): each fills New routine with its name, request and when, and a glyph. */
const STARTERS = /** @type {const} */ ([['news', 'globe', { every: 'weekday', at: '08:00' }], ['week', 'list', { every: 'week', on: 1, at: '09:00' }], ['review', 'check', { every: 'week', on: 5, at: '16:00' }], ['learn', 'lamp', { every: 'day', at: '12:30' }]])

/** What a field holds now. @param {Event} e */
const value = (e) => /** @type {HTMLInputElement} */ (e.target).value
/** A routine's page, by its file's ULID. @param {string} path */
const idOf = (path) => path.split('/').at(-1)?.replace(/\.md$/, '') ?? ''
// The page open (pageOpen()): a routine's ULID, new, or '' for the list.

async function refresh() {
  const all = await routines()
  const open = pageOpen()
  const paths = all.flatMap((routine) => runsOf(routine.path).slice(0, idOf(routine.path) === open ? 10 : 1).map((run) => run.path))
  const read = await Promise.all(paths.map(async (path) => {
    const records = (await loadConversation(app.fs, path))?.records ?? []
    return /** @type {const} */ ([path, { ...routineOf(records), answered: records.some(({ update }) => update?.sessionUpdate === 'agent_message_chunk'), waits: Boolean(unanswered(records)) }])
  }))
  facts.value = new Map(read)
  list.value = all
}
effect(() => {
  void app.conversations.value
  if (app.dialog.value === 'settings' && sectionOpen() === 'routines') refresh().catch((error) => console.warn('Routines', error))
})

/** Opens the list ('') or a page, the keyboard on its title, or back on the list on the routine's row. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `routines/${to}` : 'routines'
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.routine-head h2' : `[data-routine="${from}"]`))?.focus())
}

/** When a routine runs, in words: every Monday at 8:30 (in French too, without CLDR's leading zero), or what sets it off. @param {Plan} routine */
function when(routine) {
  if (routine.when) return t(`routines.when.${routine.when}`)
  const [hours, minutes] = String(routine.at).split(':').map(Number)
  const format = (/** @type {Intl.DateTimeFormatOptions} */ options, /** @type {Date} */ date) => new Intl.DateTimeFormat(intlLocales(), options).formatToParts(date).map(({ type, value }) => (type === 'hour' ? value.replace(/^0(?=\d)/, '') : value)).join('')
  const day = routine.every === 'week' ? format({ weekday: 'long' }, new Date(2026, 0, 4 + Number(routine.on))) : routine.every === 'once' ? format({ dateStyle: 'medium' }, new Date(`${routine.on}T00:00`)) : Number(routine.on)
  return t(`routines.plan.${routine.every}`, { day, time: format({ timeStyle: 'short' }, new Date(2026, 0, 4, hours, minutes)), minute: new Intl.NumberFormat(intlLocales(), { minimumIntegerDigits: 2 }).format(minutes) })
}

/** When it runs and when next, as its row and its page say it. @param {Routine} routine */
const line = (routine, soon = next(routine)) => (soon ? `${when(routine)} · ${t('routines.next', { when: relativeTime(soon) })}` : when(routine))

/**
 * How a run went: still working (or only just begun, maybe in another tab), waiting for the user, done, or stopped before any answer.
 * @param {{ path: string, updatedAt: string } | undefined} run
 */
function outcome(run) {
  const known = run && facts.value.get(run.path)
  if (run && app.running.value.includes(run.path)) return app.decisions.value.some((decision) => decision.conversation === run.path) ? 'waits' : 'busy'
  return !run || !known ? null : known.waits ? 'waits' : known.answered ? 'done' : Date.now() - Date.parse(run.updatedAt) < 120_000 ? 'busy' : 'failed'
}

/** When a run fell due, as one that ran late says it: its time, or its day too when it ran on another. @param {Date} due @param {Date} ran */
const closed = (due, ran) => new Intl.DateTimeFormat(intlLocales(), due.toDateString() === ran.toDateString() ? { timeStyle: 'short' } : { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(due)

/** A run's outcome in a word, done with when on the list. @param {string | null} kind @param {string} [at] */
const pill = (kind, at) => (kind ? html`<span class="run-state is-${kind}">${kind === 'done' ? icons.check : nothing}${kind === 'busy' ? t('activity.working')
  : kind === 'done' && at ? t('routines.doneWhen', { when: relativeTime(new Date(at)) }) : t(`routines.${kind}`)}</span>` : nothing)

// ─── Changing them ───────────────────────────────────────────────────────────

let changing = Promise.resolve()

/**
 * A routine's schedule as a change leaves it, or what sets it off: a week or a month needs its day, today's until the user
 * picks another; once, the next time it says; one a file set off before, at nine. @param {Plan} kept @param {Record<string, unknown>} change
 */
function replan(kept, change) {
  const [changed, today] = [/** @type {Record<string, any>} */ ({ ...kept, ...change }), new Date()]
  return trigger(changed) ?? schedule({ at: '09:00', ...changed, on: changed.every === kept.every ? changed.on : changed.every === 'week' ? today.getDay() : changed.every === 'once' ? undefined : today.getDate() })
}

/**
 * Changes a routine's schedule, what sets it off, its request or whether it is on, kept only when the schedule is one.
 * Changes made in quick succession apply one after the other, each to the routine as it is kept.
 * @param {Routine} routine @param {Record<string, unknown>} change
 */
function change(routine, change) {
  changing = changing.then(async () => {
    const kept = (await routines()).find((other) => other.path === routine.path)
    if (!kept) return
    const { path, title, request, author, createdAt, active, lastRun, resumed, flow, brain, model } = /** @type {Routine} */ ({ ...kept, ...change })
    const plan = replan(kept, change)
    if (plan && request.trim()) await writeRoutine(app.fs, { path, title, request, author, createdAt, active, lastRun, resumed, flow, brain, model, ...plan })
  }).then(refresh, (error) => console.warn('Routine', error))
  return changing
}

/** Turned back on, it makes up none of the times it fell due while off (D430). @param {Routine} routine */
const turn = (routine) => (/** @type {{ target: HTMLInputElement }} */ { target }) => change(routine, { active: target.checked, resumed: target.checked ? new Date().toISOString() : undefined })

/** @param {Routine} routine */
async function remove(routine) {
  if (!confirm(t('routines.confirmDelete', { title: routine.title }))) return
  await app.fs.remove(routine.path)
  act('routine.remove', { path: routine.path })
  go('')
}

/** @param {SubmitEvent} event */
async function make(event) {
  event.preventDefault()
  const { title, request, ...plan } = draft.value
  const routine = newRoutine(folder(), { title: title.trim(), request: request.trim(), by: app.deviceId, .../** @type {any} */ (replan(plan, {})) })
  await writeRoutine(app.fs, routine)
  act('routine.add', { path: routine.path, title: routine.title, ...('every' in routine ? { every: routine.every } : { when: routine.when }) })
  draft.value = { title: '', request: '', every: 'day', at: '09:00' }
  await refresh()
  go(idOf(routine.path))
}

// ─── The list and the pages ──────────────────────────────────────────────────

// Words being typed are set only when what is kept changes, never by a repaint (a run ending meanwhile), which would take them back.

/** Settings' Routines: the list, or the page open. */
export function section() {
  const [all, open] = [list.value, pageOpen()]
  const routine = all?.find((one) => idOf(one.path) === open)
  return !all ? nothing : routine ? page(routine) : open === 'new' ? made() : listed(all)
}

/** What runs next and what waits for the user, then every routine, the way to make one, and when they run. @param {Routine[]} all */
function listed(all) {
  const soonest = all.map((routine) => ({ routine, at: next(routine) })).filter(({ at }) => at).sort((a, b) => Number(a.at) - Number(b.at))[0]
  const waiting = all.filter((routine) => outcome(runsOf(routine.path)[0]) === 'waits').length
  // In some hours, on a day of the week, or on a date.
  const ahead = soonest?.at ? Number(soonest.at) - Date.now() : 0
  const at = !soonest?.at ? '' : ahead < 86_400_000 ? relativeTime(soonest.at) : new Intl.DateTimeFormat(intlLocales(), ahead < 6 * 86_400_000 ? { weekday: 'long', hour: 'numeric', minute: '2-digit' } : { dateStyle: 'medium', timeStyle: 'short' }).format(soonest.at)
  return html`<header class="routine-head"><h2>${t('cap.routines.name')}</h2><button class="button" @click=${() => go('new')}>${icons.plus} ${t('routines.new')}</button></header>
    ${soonest || waiting ? html`<p class="lede">${soonest ? html`<strong dir="auto">${t('routines.upcoming', { title: soonest.routine.title, when: String(at) })}</strong> ` : nothing}${waiting
      ? t('routines.waiting', { count: waiting }) : nothing}</p>` : nothing}
    ${all.length ? html`<section><ul class="list routines">${all.map((routine) => {
      const [last, id] = [runsOf(routine.path)[0], idOf(routine.path)]
      // The whole row opens its page, but for its switch; its button is the way there from the keyboard.
      return html`<li class=${routine.active ? '' : 'is-off'} @click=${(/** @type {Event} */ e) => /** @type {Element} */ (e.target).closest('.item, .switch') || go(id)}>
        <button class="item" data-routine=${id} @click=${() => go(id)}>
          <span class="item-icon">${'when' in routine ? icons.file : icons.alarm}</span><span class="item-text"><strong dir="auto">${routine.title}</strong><small>${line(routine)}</small></span>
          ${routine.active ? pill(outcome(last), last?.createdAt) : pill('paused')}</button>
        <input type="checkbox" class="switch" role="switch" aria-label=${routine.title} .checked=${routine.active} @change=${turn(routine)}>${icons.chevron}</li>`
    })}</ul></section>` : html`<p class="muted small">${t('routines.none')}</p>`}
    <section><h3>${t('routines.starters')}</h3><ul class=${all.length ? 'routine-starts' : 'routine-starts is-empty'}>${STARTERS.map(([id, glyph, plan]) => html`<li><button class="routine-start"
      @click=${() => { draft.value = { title: t(`routines.starter.${id}`), request: t(`routines.starter.${id}.request`), ...plan }; go('new') }}><span class="item-icon">${icons[glyph]}</span>
      <span class="item-text"><strong>${t(`routines.starter.${id}`)}</strong><small>${when(plan)}</small><q>${t(`routines.starter.${id}.request`)}</q></span>${icons.plus}</button></li>`)}</ul></section>
    <p class="hint">${t('routines.text')}</p>`
}

/** Back to the list, the page's title and when it runs, then what is at its end. @param {string} title @param {unknown} said @param {unknown} [end] */
const head = (title, said, end = nothing) => html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t('cap.routines.name')}</button>
  <header class="routine-head"><div><h2 dir="auto" tabindex="-1">${title}</h2><p class="lede">${said}</p></div>${end}</header>`

/** A routine's page: Run now and its switch, then its request, when, who answers, its runs, and Delete. @param {Routine} routine */
function page(routine) {
  const runs = runsOf(routine.path).slice(0, 10)
  const at = new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'full', timeStyle: 'short' })
  // Run now and its switch beside its title (D430): a routine a file sets off runs only when one comes.
  return html`${head(routine.title, line(routine), html`<span class="routine-acts">${'when' in routine ? nothing
    : html`<button class="button" ?disabled=${app.busy.value} @click=${() => runNow(routine.path)}>${icons.play} ${t('routines.run')}</button>`}
    <input type="checkbox" class="switch" role="switch" aria-label=${routine.title} .checked=${routine.active} @change=${turn(routine)}></span>`)}
    <section class="routine-form">
      ${routine.flow ? html`<p><button class="link-button" title=${t('cap.flows.name')} @click=${() => { app.dialog.value = null; import('../flows/flows.js').then((flows) => flows.edit(/** @type {string} */ (routine.flow))) }}>${icons.flow}
        <span dir="auto">${routine.request}</span></button></p>` : html`<label>${t('routines.request')}<textarea rows="3" dir="auto" .value=${routine.request}
        @change=${(/** @type {Event} */ e) => change(routine, { request: value(e) })}></textarea></label>`}
      ${planned(routine, (patch) => change(routine, patch))}
      ${brainChoice(routine)}
    </section>
    ${runs.length ? html`<section><h3>${t('routines.runs')}</h3><ul class="list routine-runs">${runs.map((run) => {
      const known = facts.value.get(run.path)
      const late = known?.due && !known.asked && !known.file && Date.parse(run.createdAt) - Date.parse(known.due) > 300_000
      return html`<li><button class="item" @click=${() => openConversation(run.path)}><span class="item-text"><span>${at.format(new Date(run.createdAt))}</span>${known?.asked
        ? html`<small>${t('routines.asked')}</small>` : known?.file ? html`<small dir="auto">${t('routines.file', { file: known.file })}</small>`
        : late ? html`<small>${t('routines.late', { time: closed(new Date(String(known.due)), new Date(run.createdAt)) })}</small>` : nothing}</span>
        ${pill(outcome(run))}${icons.chevron}</button></li>`
    })}</ul></section>` : nothing}
    <div class="row"><button class="button subtle danger" @click=${() => remove(routine)}>${icons.trash} ${t('routines.delete')}</button></div>`
}

/** Making a routine: its name, what to do and when; who answers is the user's messages' until its page says otherwise. */
function made() {
  const set = (/** @type {Record<string, unknown>} */ patch) => { draft.value = { ...draft.value, ...patch } }
  const input = (/** @type {'title' | 'request'} */ key) => (/** @type {Event} */ e) => set({ [key]: /** @type {HTMLInputElement} */ (e.target).value })
  return html`${head(t('routines.new'), t('routines.text'))}
    <section><form class="routine-form" @submit=${make}>
      <label>${t('routines.name')}<input required dir="auto" maxlength="80" .value=${draft.value.title} @input=${input('title')}></label>
      <label>${t('routines.request')}<textarea required rows="3" dir="auto" .value=${draft.value.request} @input=${input('request')}></textarea></label>
      ${planned(draft.value, (patch) => { const { title, request } = draft.value; draft.value = { title, request, ...replan(draft.value, patch) } })}
      <div class="row"><button class="button primary">${t('routines.make')}</button></div>
    </form></section>`
}

/**
 * When it runs, each with its name: how often or what sets it off, the day a week, a month or once needs, the time or
 * an hour's minutes; for a file, the question it must pass. @param {Plan} routine @param {(patch: Record<string, unknown>) => unknown} set
 */
function planned(routine, set) {
  const [{ first }, days] = [week(), new Intl.DateTimeFormat(intlLocales(), { weekday: 'long' })]
  const timed = routine.when ? null : routine
  // An hour's minutes, every five and the routine's own.
  const [minute, two] = [Number(timed?.at?.slice(3) ?? 0), new Intl.NumberFormat(intlLocales(), { minimumIntegerDigits: 2 })]
  const minutes = [...new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, minute])].sort((a, b) => a - b)
  return html`<div class="routine-when">
    <label>${t('routines.every')}<select @change=${(/** @type {Event} */ e) => set(WHEN.includes(/** @type {any} */ (value(e))) ? { when: value(e) } : { every: value(e), when: undefined })}>
      ${EVERY.map((every) => html`<option value=${every} ?selected=${every === timed?.every}>${t(`routines.every.${every}`)}</option>`)}
      ${WHEN.map((when) => html`<option value=${when} ?selected=${when === routine.when}>${t(`routines.when.${when}`)}</option>`)}
    </select></label>
    ${timed?.every === 'week' ? html`<label>${t('routines.on')}<select @change=${(/** @type {Event} */ e) => set({ on: Number(value(e)) })}>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => (first + i) % 7).map((day) => html`<option value=${day} ?selected=${day === timed.on}>${days.format(new Date(2026, 0, 4 + day))}</option>`)}
    </select></label>` : timed?.every === 'month' ? html`<label>${t('routines.on')}<input type="number" min="1" max="31" .value=${live(String(timed.on ?? 1))}
      @change=${(/** @type {Event} */ e) => set({ on: Number(value(e)) })}></label>` : timed?.every === 'once' ? html`<label>${t('routines.on')}<input type="date" .value=${live(String(timed.on))}
      @change=${(/** @type {Event} */ e) => set({ on: value(e) })}></label>` : nothing}
    ${!timed ? nothing : timed.every === 'hour' ? html`<label>${t('routines.at')}<select @change=${(/** @type {Event} */ e) => set({ at: `${String(timed.at).slice(0, 3)}${value(e).padStart(2, '0')}` })}>
      ${minutes.map((each) => html`<option value=${each} ?selected=${each === minute}>${t('routines.minute', { minute: two.format(each) })}</option>`)}
    </select></label>` : html`<label>${t('routines.at')}<input type="time" .value=${live(String(timed.at))} @change=${(/** @type {Event} */ e) => set({ at: value(e) })}></label>`}
  </div>
  ${routine.when ? html`<label>${t('routines.if')}<input type="text" dir="auto" .value=${routine.if ?? ''} @change=${(/** @type {Event} */ e) => set({ if: value(e) })}></label>` : nothing}`
}

/**
 * Who answers a routine's runs (D303): the brain the user's messages have, Auto, or one the picker offers; its own
 * at a version the picker no longer offers stays, and one the room no longer has answers as the user's messages do.
 * @param {Routine} routine
 */
function brainChoice(routine) {
  const offered = choices()
  const own = brainsHere.value.find((brain) => brain.id === routine.brain)
  const listed = offered.some(({ brain, model }) => brain.id === routine.brain && model === routine.model)
  const pick = (/** @type {Event} */ e, picked = value(e), choice = /^\d+$/.test(picked) ? offered[Number(picked)] : undefined) =>
    change(routine, choice ? { brain: choice.brain.id, model: choice.model } : { brain: picked === 'auto' ? picked : undefined, model: undefined })
  return html`<label>${t('routines.brain')}<select @change=${pick}>
    <option value="" ?selected=${!routine.brain || (routine.brain !== 'auto' && !own)}>${t('routines.brain.yours')}</option>
    <option value="auto" ?selected=${routine.brain === 'auto'}>${t('auto.name')}</option>
    ${offered.map(({ label, behind, brain, model }, i) => html`<option value=${i} title=${behind} ?selected=${brain.id === routine.brain && model === routine.model}>${label}</option>`)}
    ${own && !listed ? html`<option selected>${(routine.model || own.model).split('/').at(-1)}</option>` : nothing}
  </select></label>`
}
