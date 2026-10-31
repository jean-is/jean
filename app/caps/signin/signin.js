// Signing in with the organisation's account (D385). Policy's `signIn` names its identity provider
// (OpenID Connect, Entra ID first) and the app IT registered there for Jean; each policy brain that
// says `auth: 'oidc'`, the organisation's AI gateway, gets the access token as its key, kept under
// its id so that every request reads it as any brain's. Jean signs in at the first visit, with PKCE
// from the browser as a connection does (caps/connections/auth.js), keeps the tokens in .secrets/
// (sealed at rest, never in a backup, export, sync or share), and renews them before they end, one
// tab at a time. A renewal refused, or a sign-in that came back without tokens, asks from a toast,
// never in a loop. Another part of policy may name a sign-in of its own, under another id. The ID token's
// groups and roles are kept with the tokens, for ee/'s policy by group (D429), which finishes a return first.
// Signing out stays signed out, on a screen of its own, until the person signs in; a lock locks with it. A curtain
// goes before each trip to the identity provider and greets the person back (D669).
import { signal } from '@preact/signals-core'
import { html, nothing, render, svg } from 'lit-html'
import { discover, authorization, finish, refresh } from '../connections/auth.js'
import { register, loaded } from '../../ui/caps.js'
import { app, effective, notify } from '../../ui/state.js'
import { getSecret, setSecret, deleteSecret } from '../../ui/secrets.js'
import { VAULT } from '../../ui/seal.js'
import { mine, here, PLACE } from '../../ui/opfs.js'
import { behind, curtainFor, otherBadges, initialOf, switchTo, whoOf } from '../../ui/curtain.js'
import { icon } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { BRAND } from '../../brand.js'
import { t, useStrings, locale, dir } from '../../core/i18n.js'

/** @typedef {{ issuer: string, clientId: string, scopes?: string[] }} SignIn  what policy names */
/** @typedef {import('../connections/auth.js').Tokens & { end?: string }} Kept  end: where signing out goes */

const PENDING = 'app.signin'
/** Kept per profile once the person signs out: they stay so until they sign in. */
const OUT = 'app.signedOut'
/** Signing out here signs out this profile's other tabs. */
const tabs = new BroadcastChannel(mine('app-signin'))
/** Renewed this long before it ends, since a turn reads its key once, as it starts. */
const AHEAD = 5 * 60_000
await useStrings('signin')

/** Who is signed in to the organisation, for Settings › Brains, and what the account calls them, for the person's menu. */
export const account = signal(/** @type {string | null} */ (null))
const name = signal(/** @type {string | null} */ (null))
/** Each sign-in started, by id: what policy names for it. @type {Map<string, SignIn>} */
const named = new Map()
/** Renewals under way, one a sign-in. @type {Map<string, Promise<string | null>>} */
const renewing = new Map()
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map()
/** Each sign-in come back from, by id: whether it had, once its tokens are kept. @type {Map<string, Promise<boolean>>} */
const returned = new Map()

/** This profile's vault.json, plain, with its name, colour and slots. @returns {Promise<any>} */
const vaultOf = async () => JSON.parse(await app.fs.read(VAULT) ?? 'null')
tabs.onmessage = async ({ data }) => { if (data === 'out') switchTo(here(), whoOf(await vaultOf())) }

/** @param {string} id @returns {Promise<Kept | null>} */
const read = async (id) => JSON.parse((await getSecret(app.fs, id)) ?? 'null')
/** About to end, so renewed now. @param {Kept | null} kept */
const due = (kept) => Boolean(kept?.expiresAt && kept.expiresAt <= Date.now() + AHEAD)
/** The brains whose key the organisation's sign-in is. @param {string} id */
const brainsOf = (id) => (id === 'signin' ? effective.value.settings.brains.filter((brain) => brain.auth === 'oidc') : [])

/** Kept tokens in use: who signed in, the brains' key where it changed, the next renewal. @param {string} id @param {Kept} kept */
async function use(id, kept) {
  if (id === 'signin') [account.value, name.value] = [kept.account ?? null, kept.name ?? null]
  for (const brain of brainsOf(id)) if ((await getSecret(app.fs, brain.id)) !== kept.access) await setSecret(app.fs, brain.id, kept.access)
  clearTimeout(timers.get(id))
  // A minute apart at least, should one fail.
  if (kept.expiresAt) timers.set(id, setTimeout(() => token(id), Math.max(kept.expiresAt - AHEAD - Date.now(), 60_000)))
}

/** @param {string} id @param {Kept} kept */
const keep = (id, kept) => setSecret(app.fs, id, JSON.stringify(kept)).then(() => use(id, kept))

/** @param {string} id */
async function forget(id) {
  for (const each of [id, ...brainsOf(id).map((brain) => brain.id)]) await deleteSecret(app.fs, each)
  if (id === 'signin') account.value = name.value = null
}

/**
 * Leaves for the identity provider, with what the user had typed and shared (`leave()`), to come back here,
 * asking for the person's name too (`profile`).
 * @param {string} [id] @param {SignIn} [given]
 */
export async function signIn(id = 'signin', given = named.get(id) ?? app.policy.signIn) {
  const metadata = await discover(given.issuer, { issuer: given.issuer })
  const { url, pending } = await authorization(metadata, { clientId: given.clientId, redirectURI: location.origin + location.pathname, scopes: [...given.scopes ?? [], 'profile'] })
  sessionStorage.setItem(PENDING, JSON.stringify({ ...pending, id, end: metadata.end_session_endpoint }))
  behind(whoOf(await vaultOf()))
  ;(await import('../../ui/brains.js')).leave(url)
}

/** Asks to sign in again, from a toast. @param {string} id */
const offer = (id) => notify(t('signin.needed'), { label: t('signin.in'), run: () => { signIn(id).catch((error) => console.warn('Sign-in', error)) } })

/**
 * The access token, renewed when it is about to end; null when there is none, or it can't be renewed now.
 * @param {string} [id] @returns {Promise<string | null>}
 */
export async function token(id = 'signin') {
  const kept = await read(id)
  return due(kept) ? renewing.get(id) ?? renewing.set(id, renew(id).finally(() => renewing.delete(id))).get(id) ?? null : kept?.access ?? null
}

/**
 * One renewal for every tab: the first renews, the others read what it kept. Unreachable, the
 * tokens stay for the next try; refused, they go, and the user is asked to sign in again.
 * @param {string} id
 */
const renew = (id) => navigator.locks.request(`app-signin-${id}`, async () => {
  const kept = await read(id)
  if (!kept || !due(kept)) return kept?.access ?? null
  try {
    const fresh = { ...kept, ...await refresh(kept) }
    return keep(id, fresh).then(() => fresh.access)
  } catch (error) {
    console.warn('Sign-in', error)
    if (error instanceof TypeError) return use(id, kept).then(() => null)
    return forget(id).then(() => (offer(id), null))
  }
})

/**
 * Back from signing in, what the user had typed and shared comes back, and the code becomes tokens, kept. ui/app.js
 * asks for the organisation's before a profile or settings read policy, which the groups it gives change (D429);
 * start() reads what came of it. @param {string} [id] @returns {Promise<boolean>} whether Jean came back from it
 */
export const back = (id = 'signin') => returned.get(id) ?? /** @type {Promise<boolean>} */ (returned.set(id, finishing(id)).get(id))

/** @param {string} id */
async function finishing(id) {
  const [saved, query] = [JSON.parse(sessionStorage.getItem(PENDING) ?? 'null'), new URLSearchParams(location.search)]
  if (saved?.id !== id || !query.has('state')) return false
  sessionStorage.removeItem(PENDING)
  ;(await import('../../ui/brains.js')).comeBack()
  await setSecret(app.fs, id, JSON.stringify({ ...await finish(query, saved), end: saved.end }))
  return true
}

/**
 * Before the room shows. Back from signing in, the tokens are kept and the user is where they were;
 * with none kept, Jean leaves to sign in; otherwise they are renewed when due, and when the page shows again.
 * @param {string} [id] @param {SignIn} [given]
 * @returns {Promise<void>} never, while it leaves
 */
export async function start(id = 'signin', given = app.policy.signIn) {
  named.set(id, given)
  if (id === 'signin' && localStorage.getItem(mine(OUT))) return signedOut(given)
  try {
    if (!(await back(id)) && !(await token(id)) && !(await read(id))) return await signIn(id, given).then(() => new Promise(() => {}))
  } catch (error) {
    console.warn('Sign-in', error)
    offer(id)
  }
  await read(id).then((kept) => kept && use(id, kept))
  greet(id)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') token(id) })
  if (id === 'signin') try { navigator.serviceWorker?.controller?.postMessage({ type: 'CACHE_CAPABILITY', id: 'signin' }) } catch {}
}

/** The curtain back from signing in calls the person what the account does, if their profile has no name of its own. @param {string} id */
function greet(id) {
  const [, badge, title] = document.getElementById('curtain')?.children ?? []
  if (id === 'signin' && name.peek() && title?.textContent === BRAND.name) [badge.textContent, title.textContent] = [initialOf(/** @type {string} */ (name.peek())), name.peek()]
}

/**
 * Signed out: a screen that stays, whatever reloads it, with Sign in, and the other profiles to go to, Jean going no
 * further until the person signs in. It says what stays here where no lock keeps it. @param {SignIn} given @returns {Promise<void>} never
 */
async function signedOut(given) {
  await styleSheet(new URL('../lock/lock.css', import.meta.url))
  Object.assign(document.documentElement, { lang: locale.value, dir: dir(locale.value) })
  const [of, others] = [await vaultOf(), await Promise.all((await app.whole?.list('profiles') ?? []).map(({ name: folder }) => `profiles/${folder}`).filter((folder) => folder !== here())
    .map(async (folder) => /** @type {[string, any]} */ ([folder, JSON.parse(await app.whole?.read(`${folder}/${VAULT}`) ?? 'null')])))]
  const who = whoOf(of)
  document.title = `${who.name} · ${BRAND.name}`
  // In place of the lock's, if that is what just opened.
  document.querySelector('#curtain main')?.remove()
  const screen = curtainFor(who).appendChild(Object.assign(document.createElement('main'), { className: 'lock' }))
  render(html`<p>${t('signin.signedOut')}</p>
    <button class="button primary lock-key" @click=${() => { localStorage.removeItem(mine(OUT)); signIn('signin', given).catch((error) => { console.warn('Sign-in', error); location.reload() }) }}>${t('signin.in')}</button>
    ${of?.slots?.some((/** @type {{ kind: string }} */ slot) => slot.kind === 'device') ? html`<p class="muted">${t('signin.kept')}</p>` : nothing}
    ${otherBadges(others)}`, screen)
  ;/** @type {HTMLElement | null} */ (screen.querySelector('.lock-key'))?.focus()
  return new Promise(() => {})
}

/** Signs out here, with every tab of this profile, and at the identity provider; a lock locks too. Jean comes back to the signed-out screen, where the person was kept for the next sign-in. */
async function signOut() {
  const kept = await read('signin')
  const who = whoOf(await vaultOf())
  await forget('signin')
  localStorage.setItem(mine(OUT), '1')
  tabs.postMessage('out')
  if (loaded.value.has('lock')) {
    const lock = await import('../lock/lock.js')
    if (lock.isOn()) lock.lockAll()
  }
  if (!kept?.end) return switchTo(here(), who, document.querySelector('.sidebar-settings.profile .avatar'))
  sessionStorage.setItem(mine(PLACE), JSON.stringify({ place: location.hash, caret: null }))
  behind(who)
  location.assign(`${kept.end}?${new URLSearchParams({ client_id: kept.clientId, post_logout_redirect_uri: location.origin + location.pathname })}`)
}

/** Leaving: a door with its way out, as Sign out only means. */
const leavingIcon = icon(svg`<path d="M10.5 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5h3.5M15.5 16l4-4-4-4M19.5 12H9.5"/>`, 'flip-rtl')

// The person at the drawer's foot is named by the account, the first name they set and the profile's coming first; Sign out is beside Lock now.
register({ id: 'signin', slots: {
  profile: { at: 2, draw: (/** @type {string} */ menu) => (account.value ? html`<button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${signOut}>${leavingIcon}${t('signin.out')}</button>` : nothing) },
  person: { at: 1, draw: () => name.value ?? account.value }, brains: { at: 0, draw: () => (account.value ? html`<section class="setting"><div><h3>${t('signin.as', { account: account.value })}</h3></div>
  <button class="button" @click=${signOut}>${t('signin.out')}</button></section>` : nothing) } } })
