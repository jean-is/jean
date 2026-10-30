// Settings › Appearance › Design system (D602, D664): its row and its page, for each capability that wears a design system to offer,
// so that it shows once any of them is found (Slides, Documents, Tables), Slides itself staying unfound. Its page loads the first time Appearance shows its row.
import { nothing } from 'lit-html'
import { signal } from '@preact/signals-core'

/** @type {import('@preact/signals-core').Signal<typeof import('./kit-page.js') | null>} */
const kitPage = signal(null)
const kitPart = () => kitPage.value ?? (void import('./kit-page.js').then((module) => { kitPage.value = module }), null)
/** The `look` slot. */
export const kitSlot = { at: 0, draw: () => kitPart()?.entry() ?? nothing, page: (/** @type {string} */ name) => (/^kit(-project)?$/.test(name) ? kitPart()?.page() ?? nothing : null) }
