// Since last time (D101): a routine that runs each time the person comes back after time away (D294), asking what is
// new in their connected services, its runs only reading. Found by coming back with a service connected; turned on, it
// makes that routine in the room, run at once since they just came back, which Settings › Routines then changes, stops
// or deletes like any other.
import { register, unlock } from '../../ui/caps.js'
import { t } from '../../core/i18n.js'

/** The routine, as the capability is turned on (ui/discovery.js's begin). */
export const make = async () => (await unlock('routines')) && (await import('../routines/routines.js')).backRoutine(t('cap.since.name'), t('since.prompt'))

register({ id: 'since' })
