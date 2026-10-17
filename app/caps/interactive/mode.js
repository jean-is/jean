// Visual answers as a mode of the box (D300): a row of + turns it on, and it shows at the foot of the box,
// pressed, until pressed again. While it is on, each message comes with a note that asks the brain to
// follow the steps of Jean's own ready-made skill Visual answers (caps/skills/directory/visual),
// read from its file whether or not the room has the skill: in full the first time in a task,
// then by its name. Its name and icon are the skill's own (D222), so the mode needs no words of its own.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { notify } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { parseSkill } from '../../core/skills.js'
import { noteRecord } from '../../core/events.js'
import { t, locale } from '../../core/i18n.js'
import { DIRECTORY, shownIn } from '../skills/directory.js'

const NAME = 'visual'
const ICON = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${DIRECTORY.find((entry) => entry.name === NAME)?.icon ?? ''}></path></svg>`

/** The skill, once read. @type {import('@preact/signals-core').Signal<NonNullable<ReturnType<typeof parseSkill>> | null>} */
const skill = signal(null)
/** Whether the mode is on. */
const on = signal(false)

fetch(new URL(`../skills/directory/${NAME}/SKILL.md`, import.meta.url))
  .then(async (response) => { skill.value = response.ok ? parseSkill(await response.text(), response.url) : null })
  .catch((error) => console.warn(error))

const title = () => (skill.value ? shownIn(skill.value, locale.value).title : '')

/** Turns it on or off, the keyboard back in the box. */
function toggle() {
  if (!skill.peek()) return notify(t('error.unknown'))
  on.value = !on.peek()
  document.getElementById('prompt')?.focus()
}

/** Its row in +, checked while it is on. */
export const row = () => (skill.value ? html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" aria-pressed=${on.value} @click=${toggle}>
  ${ICON}<span dir="auto">${title()}</span>${on.value ? icons.check : nothing}</button>` : nothing)

/** At the foot of the box while it is on: pressed, it goes. */
export const chip = () => (on.value && skill.value ? html`<button type="button" class="mode-chip" aria-pressed="true" @click=${toggle}>
  ${ICON}<span dir="auto">${title()}</span>${icons.close}</button>` : nothing)

/**
 * The note a message comes with while it is on: the skill's steps, unless the task was given them already.
 * @param {import('../../core/types.js').Envelope[]} records
 */
export function notes(records) {
  const steps = skill.peek()
  if (!on.peek() || !steps) return []
  const given = records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'mode' && update.data.mode === NAME)
  const text = `The user turned on visual answers: for this message, follow the steps of the skill ${NAME}${given ? ', given above.' : `:\n\n${steps.body}`}`
  return [noteRecord(text, { kind: 'mode', mode: NAME })]
}
