// Together's screens (D733): Share's "Work on it together" for a collection (the link, or the people chosen), the faces of who is in at
// the head of its pane, People in this collection (roles, the link, removing, stopping), and the one question a link asks a newcomer,
// the name the others see. Each member wears a colour, the same on every copy, by the order they came, with their initial beside it.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { signal } from '@preact/signals-core'
import { Element, define } from '../../ui/base.js'
import { syncDialog, closed, backdrop, head } from '../../ui/dialogs.js'
import { app, notify, showError } from '../../ui/state.js'
import { COLOURS } from '../../ui/touches.js'
import { icons } from '../../ui/menu-icons.js'
import { t, intlLocales } from '../../core/i18n.js'
import { decode } from '../../ui/seal.js'
import { membersOf, linkOf, invitation } from './circle.js'
import { circles, circleAt, begin, join, linkFor, set, move, stop, hereNow, key, ask, asking } from './engine.js'
import { BRAND } from '../../brand.js'

/** The circle People in this… shows, the newcomer a link brought, and whether something is being done. */
export const shown = signal(/** @type {string | null} */ (null))
export const asked = signal(/** @type {{ link: string } | null} */ (null))
/** A project to start working on together, from its own dialog. */
const starting = signal(/** @type {{ thing: { kind: 'project', uri: string }, title: string } | null} */ (null))
/** In a project's dialog: Work on this project together, or People in this project once it is. @param {import('../../core/settings.js').Project} project */
export const projectButton = (project) => html`<button type="button" class="button subtle" @click=${() => { const live = circleAt(project.dir); [shown.value, starting.value] = live ? [live.id, null] : [null, { thing: { kind: 'project', uri: project.dir }, title: String(project.data.name) }]; app.dialog.value = 'together' }}>${icons.people} ${t(circleAt(project.dir) ? 'together.peopleProject' : 'together.project')}</button>`
const busy = signal(false)
/** What a project's link gives when it's made. */
const role = signal(/** @type {'edit' | 'view'} */ ('edit'))

/** A member's initial in their colour. @param {import('./circle.js').Member} one */
const avatar = (one) => html`<span class="avatar" aria-hidden="true" ${ref((element) => /** @type {HTMLElement | undefined} */ (element)?.style.setProperty('--badge', COLOURS[1 + (one.colour % 7)][1]))}>${[...one.name.trim()][0]?.toLocaleUpperCase() ?? '?'}</span>`
/** Something done, its failure said, never done twice at once. @param {() => Promise<unknown>} run */
const doing = async (run) => { if (busy.peek()) return; busy.value = true; try { await run() } catch (error) { showError(error) } finally { busy.value = false } }
const names = (/** @type {string[]} */ list) => new Intl.ListFormat(intlLocales(), { type: 'conjunction' }).format(list)
const copy = (/** @type {string} */ text) => navigator.clipboard.writeText(text).then(() => notify(t('toast.copied')))

/** Where a thing is: a task and a project by their path, anything else by its folder in the project. @param {{ kind: import('./engine.js').Kind, uri: string }} thing */
const placeOf = ({ kind, uri }) => (kind === 'project' ? { dir: 'projects', folder: uri.slice(9) } : { dir: app.projectDir, folder: kind === 'task' ? uri.slice(app.projectDir.length + 1) : uri })

/**
 * Once it is worked on together, Share's line (caps/share/dialog.js): with whom, the link to copy, People in this…; for a project not yet,
 * its dialog's start: the link's role, Start, or Only on my devices. @param {{ thing?: { kind: import('./engine.js').Kind, uri: string }, title: string }} what
 */
export function how(what) {
  const kind = what.thing?.kind ?? 'collection', place = placeOf({ kind, uri: what.thing?.uri ?? '' }), live = circleAt(`${place.dir}/${place.folder}`)
  if (live) {
    const others = membersOf(live.state).filter((one) => one.fp !== live.me)
    return html`<section class="stack"><p>${others.length ? t('together.with', { names: names(others.map((one) => one.name)) }) : t('together.alone')}</p>
      ${live.kept.links && live.kept.ownerToken ? html`<div class="share-field"><input class="share-link" readonly dir="ltr" title=${t('together.link')} .value=${linkFor(live)}>
        <button class="button primary" @click=${() => copy(linkFor(live))}>${icons.copy} ${t('together.copyLink')}</button></div>` : nothing}
      <button class="button" @click=${() => { shown.value = live.id; app.dialog.value = 'together' }}>${icons.people} ${peopleIn(live)}</button></section>`
  }
  if (kind !== 'project') return nothing
  return html`<section class="stack"><p class="hint">${t('together.says')}</p><p class="hint">${t('together.projectSays', { name: BRAND.name })}</p>
    <label class="setting" for="together-role">${t('together.anyone')}<select id="together-role" @change=${(/** @type {Event} */ event) => { role.value = /** @type {any} */ (event.target).value }}>
      <option value="edit" ?selected=${role.value === 'edit'}>${t('together.canEdit')}</option><option value="view" ?selected=${role.value === 'view'}>${t('together.canView')}</option></select></label>
    <p class="hint">${t('together.days')}</p>
    <footer class="dialog-foot"><button class="button subtle" ?disabled=${busy.value} title=${t('together.mineSays')} @click=${() => doing(() => begin(place, { links: false, role: 'edit', kind }))}>${t('together.mine')}</button>
      <button class="button primary" ?disabled=${busy.value} @click=${() => doing(() => begin(place, { links: true, role: role.peek(), kind }))}>${icons.people} ${t('together.start')}</button></footer></section>`
}

/**
 * Share's verbs (caps/share/dialog.js): worked on together, begun here or the circle it is in, those ticked invited; or a link that invites
 * anyone, copied, where its owner's circle has one, else People in this… opened. @param {{ thing: { kind: import('./engine.js').Kind, uri: string }, title: string }} what
 * @param {string[]} fps those ticked, by fingerprint; none for the person's own devices alone, whom its key reaches @param {boolean} links
 */
export async function start(what, fps, links) {
  const place = placeOf(what.thing), live = circleAt(`${place.dir}/${place.folder}`) ?? await begin(place, { links, role: 'edit', kind: what.thing.kind })
  if (fps.length) await sent(live, what.title, fps)
  // Copied where the clipboard lets it; the line shows the link all the same.
  if (links && live.kept.links && live.kept.ownerToken) copy(linkFor(live)).catch(() => {})
  else if (links) [shown.value, app.dialog.value] = [live.id, 'together']
}

/** People in this task, or in this collection. @param {import('./engine.js').Live} live */
const peopleIn = (live) => t(live.kept.kind === 'task' ? 'together.peopleTask' : live.kept.kind === 'document' ? 'together.peopleDoc' : live.kept.kind === 'deck' ? 'together.peopleDeck' : live.kept.kind === 'project' ? 'together.peopleProject' : 'together.people')
/** The faces of a task worked on together, in the room's head, beside Share. @param {{ path: string } | null} current */
export const taskFaces = (current) => ((live) => (live ? faces(live) : nothing))(current?.path ? circleAt(current.path) : null)

/** Each person ticked sent an invitation, good for their key alone, through People's letters. @param {import('./engine.js').Live} live @param {string} title @param {string[]} fps */
async function sent(live, title, fps) {
  const { tell } = await import('../people/people.js')
  const link = linkOf({ owner: live.kept.owner, epoch: live.kept.epoch, read: live.kept.read, key: decode(live.kept.keys[live.kept.epoch]), ...(live.kept.write && { write: live.kept.write }) })
  for (const fp of fps) await tell(fp, { title, kind: live.kept.kind, link, invite: await invitation(live.id, await key(), fp) }, 'together')
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
    <button class="button subtle danger" @click=${() => doing(() => move(live, [one.fp]))}>${t('together.remove')}</button>` : nothing}
  ${live.kept.kind === 'task' && one.fp !== live.me && !one.gone ? html`<button class="button subtle" @click=${() => { asked.value = null; question.value = one.fp }}>${t('together.ask', { name: BRAND.name })}</button>` : nothing}</li>`

/** Whom this person asks, in People in this task, and what. */
const question = signal(/** @type {string | null} */ (null))
/** The question to another's Jean, sent as a change of the task's. @param {import('./engine.js').Live} live @param {string} fp */
const asks = (live, fp) => html`<form class="stack" @submit=${(/** @type {SubmitEvent} */ event) => {
  event.preventDefault()
  const text = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('question') ?? '').trim()
  if (text) doing(async () => { await ask(live, fp, text); question.value = null; notify(t('together.sentAsk')) })
}}><label for="together-question">${t('together.what', { name: live.state.members[fp]?.name ?? '' })}</label><textarea id="together-question" name="question" required maxlength="2000" dir="auto"></textarea>
  <div class="row"><button type="button" class="button subtle" @click=${() => { question.value = null }}>${t('together.notNow')}</button><button class="button primary">${t('together.send')}</button></div></form>`

/** What someone asked this person's Jean: a card above the conversation, Let it answer or Not now. @param {{ id: string, circle: string, from: string, text: string }} one */
export const askCard = (one) => html`<aside class="offer" role="note"><p>${t('together.asked', { person: one.from, name: BRAND.name })}</p><p dir="auto">${one.text}</p>
  <div class="row"><button class="button primary" @click=${() => answering(one)}>${t('together.letAnswer', { name: BRAND.name })}</button>
  <button class="button subtle" @click=${() => { asking.value = asking.peek().filter((other) => other !== one) }}>${t('together.notNow')}</button></div></aside>`
/** Let this person's own Jean answer it in the task, with their brain, keys and rules, as their request naming who asked. @param {{ id: string, circle: string, from: string, text: string }} one */
async function answering(one) {
  asking.value = asking.peek().filter((other) => other !== one)
  const live = circles.peek().get(one.circle)
  if (!live?.kept.place) return
  const { openConversation, send } = await import('../../ui/state.js')
  await openConversation(`${live.kept.place.dir}/${live.kept.place.folder}`)
  await send(t('together.relayed', { person: one.from, text: one.text }))
}

class TogetherDialog extends Element {
  render() {
    const live = shown.value ? circles.value.get(shown.value) : starting.value ? circleAt(starting.value.thing.uri) : null
    const owner = Boolean(live?.kept.ownerToken)
    return html`<dialog class="sheet together-dialog" @close=${closed('together')} @click=${backdrop}>
      ${asked.value ? this.joining(asked.value.link) : starting.value && !live ? html`${head(t('together.project'))}<p class="lede" dir="auto">${starting.value.title}</p>${how(starting.value)}` : live ? html`${head(peopleIn(live))}<p class="lede" dir="auto">${live.kept.title}</p>
        <ul class="list">${membersOf(live.state).map((one) => row(live, one, owner))}</ul>${question.value ? asks(live, question.value) : nothing}
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
