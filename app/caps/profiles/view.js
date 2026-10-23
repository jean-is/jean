// What a child's profile is set to (D389, D513), as their parent's Settings and their own show it: the topics in
// three baskets, the sources, what is turned off and who answers; the week's minutes; and the grid a parent changes it in.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { t, intlLocales } from '../../core/i18n.js'
import { TOPICS, CHOICES, age } from './tier.js'

/** @import { Tier, Topic, Choice } from './tier.js' */
const topics = /** @type {Topic[]} */ (Object.keys(TOPICS))
/** A list as the language says it, or None. @param {string[]} items */
const listed = (items) => (items.length ? new Intl.ListFormat(intlLocales()).format(items) : t('profiles.none'))
/** Minutes as the language writes a duration. @param {number} n */
export const span = (n) => new Intl.DurationFormat(intlLocales(), { style: 'short', minutesDisplay: 'always' }).format({ hours: Math.floor(n / 60), minutes: n % 60 })
/** A child's age, in years. @param {number} born */
export const years = (born) => new Intl.NumberFormat(intlLocales(), { style: 'unit', unit: 'year', unitDisplay: 'long' }).format(age(born))

/** The topics in three baskets, each under its choice's name, or as `named` says it to the child. @param {Tier} tier @param {(choice: Choice) => string} [named] */
export const baskets = (tier, named = (choice) => t(`profiles.choice.${choice}`)) => html`<div class="profile-baskets">${CHOICES.map((choice) => {
  const these = topics.filter((id) => tier.topics[id] === choice)
  return html`<div><h4><i class="mark is-${choice}"></i>${named(choice)}</h4><ul>${these.length ? these.map((id) => html`<li>${t(`profiles.topic.${id}`)}</li>`) : html`<li class="none">${t('profiles.none')}</li>`}</ul></div>`
})}</div>`

/** Its sources, what is turned off and who answers. @param {Tier} tier */
export const facts = (tier) => html`<dl class="profile-facts">
  <dt>${t('profiles.sources')}</dt><dd>${listed(tier.searches.map((id) => t(`profiles.source.${id}`)))}</dd>
  <dt>${t('profiles.off')}</dt><dd>${listed(tier.capabilities.deny.map((id) => t(`cap.${id}.name`)))}</dd>
  <dt>${t('profiles.brain')}</dt><dd dir="auto">${listed((tier.brains ?? []).map((brain) => brain.label || brain.model.split('/').at(-1) || ''))}</dd></dl>`

/**
 * Today's minutes and the week's, large, each over its word ("today", "this week" as Intl says them), then a bar for each of
 * the week's days, today last; read aloud as one sentence. @param {Record<string, number>} days
 */
export function week(days) {
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86_400_000))
  const each = dates.map((date) => days[date.toLocaleDateString('sv')] ?? 0)
  const [top, name, when] = [Math.max(30, ...each), new Intl.DateTimeFormat(intlLocales(), { weekday: 'short' }), new Intl.RelativeTimeFormat(intlLocales(), { numeric: 'auto' })]
  const [today, all] = [span(each[6]), span(each.reduce((sum, n) => sum + n, 0))]
  return html`<div class="profile-week" role="img" aria-label=${t('profiles.time', { today, week: all })}><p><b>${today}</b><span>${when.format(0, 'day')}</span><b>${all}</b><span>${when.format(0, 'week')}</span></p>
    <ol>${each.map((n, i) => html`<li><i ${ref((bar) => /** @type {HTMLElement | undefined} */ (bar)?.style.setProperty('--n', String(n / top)))}></i>${name.format(dates[i])}</li>`)}</ol></div>`
}

/**
 * What a parent changes: the year of birth, a choice per topic in a grid, the sources and what is turned off.
 * @param {Tier} now @param {(patch: Partial<Tier>) => void} set @param {string[]} catalogue
 */
export function editor(now, set, catalogue) {
  const year = new Date().getFullYear()
  /** A checkbox among others, for one of a list's items. @param {string[]} list @param {string} id @param {string} label @param {(next: string[]) => void} change */
  const checkbox = (list, id, label, change) => html`<label class="check"><input type="checkbox" .checked=${list.includes(id)}
    @change=${(/** @type {Event} */ e) => change(/** @type {HTMLInputElement} */ (e.target).checked ? [...list, id] : list.filter((each) => each !== id))}>${label}</label>`
  return html`<div class="stack profile-editor">
    <label class="profile-born">${t('profiles.born')}<select @change=${(/** @type {Event} */ e) => set({ born: Number(/** @type {HTMLSelectElement} */ (e.target).value) })}>
      ${Array.from({ length: 16 }, (_, i) => year - 3 - i).map((born) => html`<option ?selected=${born === now.born}>${born}</option>`)}</select><small>${years(now.born)}</small></label>
    <table class="profile-grid"><thead><tr><th scope="col">${t('profiles.topics')}</th>${CHOICES.map((choice) => html`<th scope="col">${t(`profiles.choice.${choice}`)}</th>`)}</tr></thead>
      <tbody>${topics.map((id) => html`<tr><th scope="row">${t(`profiles.topic.${id}`)}</th>${CHOICES.map((choice) => html`<td><input type="radio" name="topic-${id}"
        aria-label=${t(`profiles.choice.${choice}`)} .checked=${now.topics[id] === choice} @change=${() => set({ topics: { ...now.topics, [id]: choice } })}></td>`)}</tr>`)}</tbody></table>
    <fieldset><legend>${t('profiles.sources')}</legend>${['vikidia', 'wikipedia'].map((id) => checkbox(now.searches, id, t(`profiles.source.${id}`), (searches) => set({ searches })))}</fieldset>
    <fieldset><legend>${t('profiles.off')}</legend><div class="profile-off">${catalogue.filter((id) => id !== 'lock').map((id) => checkbox(now.capabilities.deny, id, t(`cap.${id}.name`), (deny) => set({ capabilities: { deny } })))}</div></fieldset>
  </div>`
}
