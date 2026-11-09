// Together's screens (D733): Share's "Work on it together" for a collection (the link, or the people chosen), the faces of who is in at
// the head of its pane, People in this collection (roles, the link, removing, stopping), and the one question a link asks a newcomer,
// the name the others see. Each member wears a colour, the same on every copy, by the order they came, with their initial beside it.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { app, notify, showError } from '../../ui/state.js'
import { loaded } from '../../ui/caps.js'
import { COLOURS } from '../../ui/touches.js'
import { icons } from '../../ui/menu-icons.js'
import { t, intlLocales } from '../../core/i18n.js'
import { decode } from '../../ui/seal.js'
import { membersOf, linkOf, invitation } from './circle.js'
import { circles, circleOf, circleAt, begin, join, linkFor, set, move, stop, hereNow, key } from './engine.js'

/** The circle People in this… shows, the newcomer a link brought, and whether something is being done. */
export const shown = signal(/** @type {string | null} */ (null))
export const asked = signal(/** @type {{ link: string } | null} */ (null))
const busy = signal(false)
/** What a link gives when it's made, and who to invite. */
const [role, chosen] = [signal(/** @type {'edit' | 'view'} */ ('edit')), signal(/** @type {Set<string>} */ (new Set()))]
/** The people met (caps/people), once People's pane is asked for: only where People is loaded is there an audience to choose. */
const met = signal(/** @type {import('@preact/signals-core').Signal<{ fp: string, name: string }[]> | null} */ (null))

/** A member's initial in their colour. @param {import('./circle.js').Member} one */
const avatar = (one) => html`<span class="avatar" aria-hidden="true" ${ref((element) => /** @type {HTMLElement | undefined} */ (element)?.style.setProperty('--badge', COLOURS[1 + (one.colour % 7)][1]))}>${[...one.name.trim()][0]?.toLocaleUpperCase() ?? '?'}</span>`
/** Something done, its failure said, never done twice at once. @param {() => Promise<unknown>} run */
const doing = async (run) => { if (busy.peek()) return; busy.value = true; try { await run() } catch (error) { showError(error) } finally { busy.value = false } }
const names = (/** @type {string[]} */ list) => new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).format(list)
const copy = (/** @type {string} */ text) => navigator.clipboard.writeText(text).then(() => notify(t('toast.copied')))

/**
 * Share's pane when working together is chosen (caps/share/dialog.js): with the link, its role and Start; with the people chosen, those
 * to invite; once working together, the link to copy and People in this collection. @param {{ thing?: { kind: 'collection' | 'task', uri: string }, title: string }} what
 * @param {{ label(): string } | null} to People's audience, or none for a link
 */
export function how(what, to) {
  const kind = what.thing?.kind ?? 'collection', uri = what.thing?.uri ?? ''
  // A task is named by its path, a collection by its folder in the project.
  const folder = kind === 'task' ? uri.slice(app.projectDir.length + 1) : uri
  const live = circleOf(folder)
  if (live) {
    const others = membersOf(live.state).filter((one) => one.fp !== live.me)
    return html`<section class="stack"><p>${others.length ? t('together.with', { names: names(others.map((one) => one.name)) }) : t('together.alone')}</p>
      ${live.kept.links && live.kept.ownerToken ? html`<div class="share-field"><input class="share-link" readonly dir="ltr" title=${t('together.link')} .value=${linkFor(live)}>
        <button class="button primary" @click=${() => copy(linkFor(live))}>${icons.copy} ${t('together.copyLink')}</button></div>` : nothing}
      ${to ? invite(live, what.title) : nothing}
      <button class="button" @click=${() => { shown.value = live.id; app.dialog.value = 'together' }}>${icons.people} ${peopleIn(live)}</button></section>`
  }
  const start = (/** @type {boolean} */ links) => doing(async () => {
    const started = await begin({ dir: app.projectDir, folder }, { links, role: role.peek(), kind })
    if (!links) await sent(started, what.title)
  })
  return html`<section class="stack"><p class="hint">${t('together.says')}</p>
    ${to ? people() : html`<label class="setting" for="together-role">${t('together.anyone')}<select id="together-role" @change=${(/** @type {Event} */ event) => { role.value = /** @type {any} */ (event.target).value }}>
      <option value="edit" ?selected=${role.value === 'edit'}>${t('together.canEdit')}</option><option value="view" ?selected=${role.value === 'view'}>${t('together.canView')}</option></select></label>`}
    <p class="hint">${t('together.days')}</p>
    <footer class="dialog-foot"><button class="button primary" ?disabled=${busy.value || (to !== null && !chosen.value.size)} @click=${() => start(!to)}>${icons.people} ${t(to ? 'together.invite' : 'together.start')}</button></footer></section>`
}

/** People in this task, or in this collection. @param {import('./engine.js').Live} live */
const peopleIn = (live) => t(live.kept.kind === 'task' ? 'together.peopleTask' : 'together.people')
/** The faces of a task worked on together, in the room's head, beside Share. @param {{ path: string } | null} current */
export const taskFaces = (current) => ((live) => (live ? faces(live) : nothing))(current?.path ? circleAt(current.path) : null)

/** The people met, to invite, each ticked or not (caps/people). */
function people() {
  if (!loaded.value.has('people')) return nothing
  if (!met.value) import('../people/people.js').then((module) => { met.value = module.people })
  return html`<fieldset><legend>${t('together.whom')}</legend><ul class="list">${(met.value?.value ?? []).map((one) => html`<li><label class="row" for=${`together-${one.fp}`}>
    <input id=${`together-${one.fp}`} type="checkbox" .checked=${chosen.value.has(one.fp)} @change=${(/** @type {Event} */ event) => { const next = new Set(chosen.peek()); if (/** @type {HTMLInputElement} */ (event.target).checked) next.add(one.fp); else next.delete(one.fp); chosen.value = next }}>
    <bdi>${one.name}</bdi></label></li>`)}</ul></fieldset>`
}

/** Those chosen invited to a circle begun or under way. @param {import('./engine.js').Live} live @param {string} title */
const invite = (live, title) => html`${people()}<footer class="dialog-foot"><button class="button primary" ?disabled=${busy.value || !chosen.value.size} @click=${() => doing(() => sent(live, title))}>${icons.people} ${t('together.invite')}</button></footer>`

/** Each person chosen sent an invitation, good for their key alone, through People's letters. @param {import('./engine.js').Live} live @param {string} title */
async function sent(live, title) {
  const { tell } = await import('../people/people.js')
  const link = linkOf({ owner: live.kept.owner, epoch: live.kept.epoch, read: live.kept.read, key: decode(live.kept.keys[live.kept.epoch]), ...(live.kept.write && { write: live.kept.write }) })
  for (const fp of chosen.peek()) await tell(fp, { title, kind: live.kept.kind, link, invite: await invitation(live.id, await key(), fp) }, 'together')
  chosen.value = new Set()
  notify(t('together.invited'))
}

/** The faces of those here now, in the head of the thing's pane, opening People in this collection. @param {import('./engine.js').Live} live */
export function faces(live) {
  const here = hereNow(live), others = membersOf(live.state).filter((one) => one.fp !== live.me), now = others.filter((one) => here.has(one.fp))
  return html`<button class="icon-button together-faces" aria-label=${now.length ? t('together.here', { names: names(now.map((one) => one.name)) }) : peopleIn(live)}
    @click=${() => { shown.value = live.id; app.dialog.value = 'together' }}>${(now.length ? now : others).slice(0, 3).map(avatar)}${others.length ? nothing : icons.people}</button>`
}

/** A member's row: their name, how they came, whether they're here, and the owner's choices. @param {import('./engine.js').Live} live @param {import('./circle.js').Member} one @param {boolean} owner */
const row = (live, one, owner) => html`<li>${avatar(one)}<span class="item-text"><strong><bdi>${one.name}</bdi>${one.fp === live.me ? ` ${t('together.you')}` : ''}</strong>
  <small>${t(hereNow(live).has(one.fp) || one.fp === live.me ? 'together.hereNow' : 'together.away')} · ${t(one.role === 'owner' ? 'together.owner' : one.how === 'link' ? 'together.byLink' : 'together.byInvite')}</small></span>
  ${owner && one.fp !== live.me ? html`<select aria-label=${t('together.role', { name: one.name })} title=${t('together.role', { name: one.name })} @change=${(/** @type {Event} */ event) => doing(() => set(live, one.fp, /** @type {any} */ (event.target).value))}>
      <option value="editor" ?selected=${one.role === 'editor'}>${t('together.canEdit')}</option><option value="viewer" ?selected=${one.role === 'viewer'}>${t('together.canView')}</option></select>
    ${one.blocked ? nothing : html`<button class="button subtle" @click=${() => doing(() => set(live, one.fp, 'block'))}>${t('together.block')}</button>`}
    <button class="button subtle danger" @click=${() => doing(() => move(live, [one.fp]))}>${t('together.remove')}</button>` : nothing}</li>`

class TogetherDialog extends Element {
  render() {
    const live = shown.value ? circles.value.get(shown.value) : null
    const owner = Boolean(live?.kept.ownerToken)
    return html`<dialog class="sheet together-dialog" @close=${closed('together')} @click=${backdrop}>
      ${asked.value ? this.joining(asked.value.link) : live ? html`${head(peopleIn(live))}<p class="lede" dir="auto">${live.kept.title}</p>
        <ul class="list">${membersOf(live.state).map((one) => row(live, one, owner))}</ul>
        ${owner && live.kept.links ? html`<p class="hint">${t('together.moves')}</p><div class="row"><button class="button" @click=${() => copy(linkFor(live))}>${icons.copy} ${t('together.copyLink')}</button>
          <button class="button subtle" @click=${() => doing(() => move(live, []))}>${t('together.linkOff')}</button></div>` : nothing}
        <footer class="dialog-foot"><button class="button subtle danger" ?disabled=${busy.value} @click=${() => doing(async () => { await stop(live); app.dialog.value = null })}>${t(owner ? 'together.stop' : 'together.leave')}</button></footer>` : nothing}
    </dialog>`
  }

  /** A link's one question: the name the others see. @param {string} link */
  joining(link) {
    const go = (/** @type {SubmitEvent} */ event) => {
      event.preventDefault()
      const name = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('name') ?? '').trim()
      if (name) doing(async () => { await join(link, { name }); asked.value = null; app.dialog.value = null })
    }
    return html`${head(t('together.joinTitle'))}<form class="stack" @submit=${go}><label for="together-name">${t('together.yourName')}</label>
      <input id="together-name" name="name" required maxlength="80" autocomplete="nickname" .value=${app.settings.peek().name ?? ''}>
      <p class="hint">${t('together.newcomer')}</p>
      <footer class="dialog-foot"><button type="button" class="button subtle" @click=${() => { asked.value = null; app.dialog.value = null }}>${t('together.notNow')}</button>
        <button class="button primary" ?disabled=${busy.value}>${t('together.join')}</button></footer></form>`
  }

  updated() {
    syncDialog(this, 'together')
  }
}

define('app-together-dialog', TogetherDialog)
