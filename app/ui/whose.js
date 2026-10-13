// Whose rule decided a call (D299), in the activity's words: a call a hook refused, asked about or let go
// ahead keeps whose answer it was and what it was (_meta.by, _meta.decision). Loaded by the activity only
// once a call has one, since most never do.
import { app, effective } from './state.js'
import { slots, loaded } from './caps.js'
import { t } from '../core/i18n.js'

/**
 * "Refused by …", "Asked first by …" or "Allowed by …": a plugin by its title (the by slot) or a capability by
 * its name; a guard as the organisation's rules or the person's; one removed since, by its id.
 * @param {Record<string, any>} meta
 */
export function whose({ by, decision }) {
  const guard = ['policy', 'user'].find((tier) => (tier === 'user' ? effective.value.settings : app.policy).guards?.some((/** @type {any} */ one) => one.id === by))
  const who = slots('by').map((slot) => slot.draw({ by })).find(Boolean) ?? (loaded.value.has(by) ? t(`cap.${by}.name`) : guard ? t(`activity.by.${guard}`) : by)
  return ` · ${t(`activity.by.${decision}`, { who: String(who) })}`
}
