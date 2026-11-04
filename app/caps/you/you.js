// The user's name: shown at the foot of the conversations, and set in Settings' About you.
// Until the user has ever set it, Jean notes the one they give for themselves in a conversation,
// with `save_name`, and says so with an Undo. Once there is one, or the user emptied it, the tool
// is gone from conversations started after. Always there, like questions (D146), and loaded with
// the first message, so the first conversation can already note it. No trophy: it is how Jean
// listens, not something to find.
import { nothing } from 'lit-html'
import { computed, effect, signal } from '@preact/signals-core'
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

/** Appearance's module, once a look was proposed: its line above the box. @type {import('@preact/signals-core').Signal<typeof import('../../ui/look-page.js') | null>} */
const lookPage = signal(null)

/**
 * A look Jean proposes when asked (D693): a theme among those offered, an accent, a typeface, a text size, never CSS; worn at once,
 * with Before, Reject and Accept above the box, and kept only once the user accepts it. Found when asked for, never declared before.
 * @type {import('../../core/loop.js').Tool}
 */
const lookTool = {
  spec: {
    name: 'look',
    description: 'Propose a look for the app when the user asks to change how it looks: a theme, an accent colour, a typeface, a text size. It is worn at once, with Before, Reject and Accept above the box; nothing is kept until the user accepts.',
    parameters: { type: 'object', properties: { theme: { type: 'string', description: 'tilde, human, mail, minimal, swiss, fjord, velvet, notebook, blueprint, classic, terminal or neon' },
      accent: { type: 'string', description: '#rrggbb' }, font: { type: 'string', enum: ['sans', 'serif', 'rounded', 'mono'] }, size: { type: 'number', description: '0.85 to 1.3; 1 is as it is' },
      why: { type: 'string', description: "A few words on it, in the user's language" } }, required: ['why'] },
  },
  kind: 'edit',
  deferred: true,
  title: () => 'Propose a look',
  run: async (args) => {
    const [{ offeredLooks }, { FONTS, SIZES }] = await Promise.all([import('../../ui/looks.js'), import('../../ui/touches.js')])
    const { theme, accent = '', font = '', size } = /** @type {Record<string, any>} */ (args ?? {})
    const patch = { ...(offeredLooks(app.policy).includes(theme) && { id: theme }), ...(/^#[0-9a-f]{6}$/i.test(accent) && { accent: accent.toLowerCase() }), ...(Object.hasOwn(FONTS, font) && { font }),
      ...(typeof size === 'number' && size >= SIZES.min && size <= SIZES.max && { size: Number((Math.round(size / SIZES.step) * SIZES.step).toFixed(2)) }) }
    if (!Object.keys(patch).length) return `Nothing proposed: give a theme among ${offeredLooks(app.policy).join(', ')}, an accent as #rrggbb, a typeface or a size.`
    lookPage.value = await import('../../ui/look-page.js')
    lookPage.value.propose(patch, String(args?.why ?? '').slice(0, 200))
    return 'Worn now as your version of the look, with Before, Reject and Accept above the box; the user decides. Say so in a sentence.'
  },
}

/** Whether Jean may still note the name: the user has never set one. */
const unnamed = computed(() => app.settings.value.name === undefined)

if (!isDenied('you')) {
  // The look is found when asked for, never declared before: its rule says it is the brain's to propose, which it didn't know (D693).
  const above = { at: 30, draw: () => lookPage.value?.proposal() ?? nothing }, rules = ['Asked to change how this app looks, propose it with look, found with find_tools.']
  effect(() => register(unnamed.value
    ? { id: 'you', tools: [saveName, lookTool], lines: [{ name: 'save_name', line: 'save the first name the user gives for themselves' }], rules, slots: { above } }
    : { id: 'you', tools: [lookTool], rules, slots: { above } }))
}
