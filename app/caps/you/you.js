// The user's name: shown at the foot of the conversations, and set in Settings' About you.
// Until the user has ever set it, Jean notes the one they give for themselves in a conversation,
// with `save_name`, and says so with an Undo. Once there is one, or the user emptied it, the tool
// is gone from conversations started after. Always there, like questions (D146), and loaded with
// the first message, so the first conversation can already note it. No trophy: it is how Jean
// listens, not something to find.
import { computed, effect } from '@preact/signals-core'
import { register, isDenied } from '../../ui/caps.js'
import { app, notify, updateSettings } from '../../ui/state.js'
import { oneLine } from '../../core/memory.js'
import { t } from '../../core/i18n.js'

/** @type {import('../../core/loop.js').Tool} */
const saveName = {
  spec: {
    name: 'save_name',
    description: 'Save the first name the user gives for themselves, as in "I\'m Marie" or a message they sign. Never the name of someone else, and never a guess.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  kind: 'edit',
  title: (args) => `Your name: ${args?.name ?? ''}`,
  run: async (args) => {
    const name = oneLine(String(args?.name ?? '')).slice(0, 40)
    if (!name) throw new Error('There is no name to save.')
    // Set meanwhile, by the user or another conversation: theirs stays.
    if (app.settings.value.name !== undefined) return 'The user\'s name is already set.'
    await updateSettings({ name })
    notify(t('you.learned', { person: name }), { label: t('memory.undo'), run: () => updateSettings({ name: '' }) })
    return 'Saved.'
  },
}

/** Whether Jean may still note the name: the user has never set one. */
const unnamed = computed(() => app.settings.value.name === undefined)

if (!isDenied('you')) {
  effect(() => register(unnamed.value
    ? { id: 'you', tools: [saveName], lines: [{ name: 'save_name', line: 'save the first name the user gives for themselves' }] }
    : { id: 'you' }))
}
