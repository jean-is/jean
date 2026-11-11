// A kind of folder the brain makes (Sites, D720; Prototypes, D742): each a folder of the project, `<folder>/<ulid>-<slug>`, its files and
// its record, made or replaced whole by one tool and changed by exact passages with another, each call dressed in its look (./look.js),
// written, checked and said to the brain, and opened beside the task. Its words are retyped in place and its parts pointed at in its pane
// (./hand.js, D741); what the brain changes after the turn that made it waits as its version, `<folder>/.suggested/<ulid>-<slug>`, for the
// person to accept or reject (D505). Among the creations once the project holds one, until then its card to start one. Each kind says
// its folder, record, words, tools, check and view; Sites adds publishing (./sites.js).
import { html } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, conversationOf, notify } from '../../ui/state.js'
import { unlock } from '../../ui/caps.js'
import { icons } from '../../ui/menu-icons.js'
import { ask, reread, page } from '../../ui/creations.js'
import { save } from '../../ui/save.js'
import { noteRecord } from '../../core/events.js'
import { taskFiles, fileNamed } from '../../core/files.js'
import { writeZip } from '../../core/zip.js'
import { ulid } from '../../core/ulid.js'
import { slug } from '../../core/settings.js'
import { t } from '../../core/i18n.js'
import { pathIn, changed, retyped } from './file.js'
import { LOOK, dealt, projectLook, worn, cssOf, saidOf } from './look.js'
import { pageOf } from './frame.js'
import { lookHere, hexOf } from '../../ui/kit.js'

/** @typedef {import('./file.js').SiteRecord} SiteRecord */
/** @typedef {{ dir: string, path: string, record: SiteRecord, files: Map<string, Uint8Array> }} One */
/** @typedef {import('./frame.js').Shown} Shown */
/** @typedef {import('./frame.js').Pointed} Pointed */
/** @typedef {{ problems: string[], fill: string[], flow?: import('../prototypes/check.js').Flow }} Checked  what a check found, and what pressing through found where it was (Prototypes') */
/**
 * @typedef {Object} Kind
 * @property {string} id                     its capability
 * @property {string} folder                 its folder in the project: sites
 * @property {string} record                 its record's name: site.json
 * @property {'site' | 'prototype'} noun     what the brain calls one: site (its tools, their place's argument, the notes)
 * @property {string} words                  its strings' part: sites
 * @property {string} element                its view's element, which the notes read: app-site
 * @property {string} skill                  its skill, which brings it
 * @property {number} at                     its place among the creations' kinds
 * @property {unknown} glyph                 its kind's drawing there
 * @property {{ make: import('../../core/types.js').ToolSpec, change: import('../../core/types.js').ToolSpec }} specs
 * @property {import('../../core/loop.js').Tool['for']} [for] the brains it serves
 * @property {(files: Map<string, Uint8Array>) => string} text   what its first page says it is
 * @property {(one: One, look: import('./look.js').Look | null, said: string[], signal?: AbortSignal) => Promise<Checked>} check
 * @property {(report: Checked, at: { name: string, place: string }) => string} told
 * @property {(shown: Shown, one: One) => unknown} view  its pane
 * @property {(args: any) => Partial<SiteRecord>} [more]  what a call that makes one adds to its record (Prototypes' shape)
 */

/** A kind's machinery. @param {Kind} kind */
export function folderKind(kind) {
  const { folder, record: RECORD, noun, words } = kind
  const PLACE = new RegExp(`^${folder}/[^/.][^/]*$`), WAITING = new RegExp(`^${folder}/\\.suggested/`)
  /** Where the brain's version of one waits. @param {string} path */
  const waitingOf = (path) => path.replace(new RegExp(`^${folder}/`), `${folder}/.suggested/`)
  /** Its skill in the room, as reading it would bring it (D401). */
  const skill = async () => { if (await unlock('skills')) await (await import('../skills/skills.js')).bring([kind.skill]).catch(console.warn) }

  /** One's record, or its waiting version's; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<SiteRecord | null>} */
  const recordOf = async (path, dir = app.projectDir) => (PLACE.test(path.replace(WAITING, `${folder}/`)) ? ((record) => (record?.format ? record : null))(JSON.parse((await app.fs.read(`${dir}/${path}/${RECORD}`).catch(() => null)) ?? 'null')) : null)
  /** One of a project and its files; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<One | null>} */
  async function load(path, dir = app.projectDir) {
    const record = await recordOf(path, dir).catch(() => null)
    if (!record) return null
    const files = new Map()
    for (const file of record.files) { const bytes = await app.fs.readBytes(`${dir}/${path}/${file}`); if (bytes) files.set(file, bytes) }
    return { dir, path, record, files }
  }
  /** One written: its files, those it had and no longer has taken away, then its record. @param {One} one @param {string[]} [before] */
  async function write(one, before = []) {
    for (const [file, bytes] of one.files) await app.fs.writeBytes(`${one.dir}/${one.path}/${file}`, bytes)
    for (const file of before) if (!one.files.has(file)) await app.fs.remove(`${one.dir}/${one.path}/${file}`)
    await app.fs.write(`${one.dir}/${one.path}/${RECORD}`, JSON.stringify({ ...one.record, files: [...one.files.keys()] }, null, 1))
  }
  /** What is written, each after the one before, so that none is lost under another however fast they come. */
  let writing = /** @type {Promise<unknown>} */ (Promise.resolve())
  /** @template T @param {() => Promise<T>} work */
  const serial = (work) => { const done = writing.then(work); writing = done.catch(() => {}); return done }
  /** One's record changed as it is now. @param {string} path @param {(record: SiteRecord) => SiteRecord} change */
  const update = async (path, change) => { const one = await load(path); if (one) await write({ ...one, record: change({ ...one.record, changed: new Date().toISOString() }) }) }

  /** Designs' palettes, which looks are dealt from, read once. @type {Promise<any[]> | null} */
  let palettes = null
  /** One's three looks (./look.js, D739) and the one it wears, its record keeping it. @param {One} one @param {import('./look.js').Own} [given] the brain's colours or the user's */
  async function looksOf(one, given) {
    const tokens = await lookHere(one.dir), { looks, look, kept } = dealt({ files: one.files, seed: one.path, kept: one.record.look, given, project: (voices) => projectLook(tokens, voices, hexOf),
      palettes: await (palettes ??= fetch(new URL('../designs/layouts.json', import.meta.url)).then((response) => response.json()).then((book) => book.palettes)) })
    return { looks, look, record: { ...one.record, look: kept } }
  }

  /** The project's, the latest made first. @param {string} [dir] @returns {Promise<import('../../ui/creations.js').Creation[]>} */
  async function kept(dir = app.projectDir) {
    const places = (await app.fs.list(`${dir}/${folder}`)).flatMap(({ kind: type, name }) => (type === 'directory' ? [`${folder}/${name}`] : [])).sort().reverse()
    return (await Promise.all(places.map(async (path) => ({ path, record: await recordOf(path, dir).catch(() => null) })))).flatMap(({ path, record }) => (record ? [{ path, name: record.name,
      changed: record.changed, created: record.created, pinned: !!record.pinned, text: record.text ?? '', link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: path, name: record.name, title: record.name, mimeType: 'text/html' }) }] : []))
  }

  /** What an address names: one by its name. @param {string} path */
  const metaOf = async (path) => ((record) => record && { name: record.name, title: record.name, mimeType: 'text/html' })(await recordOf(path).catch(() => null))
  /**
   * Its view in its pane, with its looks: one picked writes look.css and keeps it in its record; the brain's version while it waits.
   * @param {{ uri: string }} file @returns {Promise<unknown>}
   */
  async function editor({ uri }) {
    const one = await load(uri), theirs = one && await load(waitingOf(uri)), shown = theirs ?? one, deal = shown?.record.look && await looksOf({ ...shown, path: uri })
    // A pick is the person's: the brain's version waiting wears it too.
    const pick = (/** @type {import('./look.js').Look} */ look) => serial(async () => { for (const now of await Promise.all([load(uri), load(waitingOf(uri))])) if (now) await write({ ...now, files: new Map(now.files).set(LOOK, new TextEncoder().encode(cssOf(look))),
      record: { ...now.record, look: { ...now.record.look, id: look.id, voice: look.voice } } }) }).catch(console.warn)
    return one && shown && kind.view({ path: one.path, name: one.record.name, files: shown.files, ...(theirs && { mine: one.files, decide: (/** @type {boolean} */ yes) => decide(uri, yes) }),
      retype: (/** @type {string} */ page, /** @type {{ old: string, new: string }[]} */ changes) => retype(uri, page, changes), ask: askJean, ...(deal && { looks: deal.looks, look: deal.look, pick }) }, shown)
  }

  /**
   * Words the person retyped in its frame (D741): each the one text of the page that read so, changed as a passage is, written, then
   * checked again; its files after, or null when any can't be, nothing changed then. @param {string} path @param {string} page
   * @param {{ old: string, new: string }[]} changes @returns {Promise<Map<string, Uint8Array> | null>}
   */
  const retype = (path, page, changes) => serial(async () => {
    const one = await load(path), text = new TextDecoder().decode(one?.files.get(page) ?? new Uint8Array()), passages = changes.map((change) => retyped(text, change.old, change.new))
    const done = one && passages.every(Boolean) && changed(one.files, passages.map((passage) => ({ path: page, ...passage })))
    return !done || 'error' in done ? null : (await write({ ...one, files: done.files, record: { ...one.record, changed: new Date().toISOString() } }), recheck(path), done.files)
  }).catch((error) => (console.warn(error), null))

  /** A check of one the person changed, under way, and the one changed since, which is checked once it ends. */
  let checking = /** @type {Promise<void> | null} */ (null), next = ''
  /** One checked again after the person changed it, in its look of now, one check at a time. @param {string} path */
  function recheck(path) {
    next = path
    checking ??= (async () => { for (let at = next; at; at = next) { next = ''; const one = await load(at); if (one) await check(one, (await looksOf(one)).look, []) } })().catch(console.warn).finally(() => { checking = null })
  }

  /** The brain's version accepted, its files and its check from now on, or rejected; either way, no longer waiting (D505). @param {string} path @param {boolean} yes */
  const decide = (path, yes) => void serial(async () => {
    const [one, theirs] = await Promise.all([load(path), load(waitingOf(path))])
    if (one && theirs && yes) await write({ ...one, files: theirs.files, record: { ...one.record, look: theirs.record.look, text: theirs.record.text, check: theirs.record.check, changed: new Date().toISOString() } }, [...one.files.keys()])
    await app.fs.remove(`${app.projectDir}/${waitingOf(path)}`), notify(t(yes ? 'sites.accepted' : 'sites.rejected'), { quiet: true })
    if (one) reread(), await open(one)
  }).catch(console.warn)

  /** One whose pane made way for the box, its page and the part pointed at there, and the task, whose next message alone still says them. @type {{ site: Shown, page: string, pointed: Pointed | null, task?: string } | null} */
  let asked = null
  /**
   * Ask Jean (D741), as Designs' does: the part pointed at, which the brain hears of with the next message, said in a toast, and the box;
   * where the pane covers the conversation, it makes way for the box first. @param {{ site: Shown, page: string, pointed: Pointed | null }} pointed
   */
  async function askJean(pointed) {
    if (document.documentElement.dataset.dock === 'over') (asked = { ...pointed, task: app.current.peek()?.path }), (await import('../../ui/preview.js')).unshow(pointed.site.path)
    document.getElementById('prompt')?.focus(), notify(t('sites.pointed'))
  }
  /** Open beside the task. @param {One} one */
  const open = (one) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: one.path, name: one.record.name, title: one.record.name, mimeType: 'text/html' }))
  /** Its files as a zip. @param {{ uri: string }} file @returns {import('../../ui/out.js').Ways['files']} */
  const zip = (file) => [{ id: '', glyph: icons.download, label: t(`${words}.zip`), run: async () => {
    const one = await load(file.uri)
    if (one) save(new Blob([/** @type {BlobPart} */ (await writeZip([...one.files].map(([name, bytes]) => ({ name, bytes }))))], { type: 'application/zip' }), `${one.record.name}.zip`)
  } }]

  /**
   * A file of a call: its text, or a file of the task by its name or place, one the user shared or Jean made (a picture, a chart), else
   * one of the project's by its place. @param {any} file @param {import('../../core/loop.js').ToolContext} ctx @returns {Promise<[string, Uint8Array]>}
   */
  async function fileOf(file, ctx) {
    const path = pathIn(file?.path)
    if (typeof file?.text === 'string') return [path, new TextEncoder().encode(file.text)]
    const from = String(file?.from ?? ''), conversation = conversationOf(ctx.signal), files = taskFiles(conversation?.records ?? [], conversation?.turn?.steps).filter((one) => !one.uri.startsWith(`${folder}/`))
    const uri = fileNamed(files, from)?.uri ?? (/^files\/[\w.-]+$/.test(from.replace(/^(\.\.?\/)+/, '')) ? from.replace(/^(\.\.?\/)+/, '') : '')
    const bytes = uri && await app.fs.readBytes(`${app.projectDir}/${uri}`)
    if (!bytes) throw new Error(from ? `There is no file named "${from}" in this task. Its files: ${[...new Set(files.map((one) => one.name))].join(', ') || 'none'}.` : `${path} has neither text nor from`)
    return [path, bytes]
  }

  /** One checked by its kind, what it found kept in its record: its problems, what is left to fill in, and its flow where it has one. @param {One} one @param {import('./look.js').Look | null} look @param {string[]} said @param {AbortSignal} [signal] */
  async function check(one, look, said, signal) {
    const report = await kind.check(one, look, said, signal), { problems, fill, flow } = report
    await serial(async () => { const record = await recordOf(one.path, one.dir); if (record) await app.fs.write(`${one.dir}/${one.path}/${RECORD}`, JSON.stringify({ ...record, text: kind.text(one.files), check: { problems, fill, ...(flow ? { flow } : {}), at: new Date().toISOString() } }, null, 1)) })
    return report
  }

  /**
   * What a call makes of one: dressed in its look, written, or as the brain's version waiting, shown, checked, and said. @param {One} given
   * @param {import('../../core/loop.js').ToolContext} ctx @param {string} done @param {string[]} before @param {import('./look.js').Own} [colours] the brain's or the user's @param {boolean} [waits]
   */
  async function checked(given, ctx, done, before, colours, waits) {
    // A page on its own, made a site again from it each time it is published, keeps its own colours.
    const { look, record } = given.record.page ? { look: null, record: given.record } : await looksOf(given, colours)
    const dressed = look ? worn(given.files, look) : { files: given.files, put: [], left: [] }, said = saidOf(dressed), one = { ...given, files: dressed.files, record }, kept = waits ? { ...one, path: waitingOf(one.path) } : one
    await serial(() => write(kept, before))
    ctx.meta.files = [{ uri: one.path, name: one.record.name, mimeType: 'text/html', size: [...one.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) }]
    const here = () => conversationOf(ctx.signal)?.path === app.current.peek()?.path
    if (here()) await open(one)
    join(one.dir), reread()
    const report = await check(kept, look, said.problems, ctx.signal)
    // What pressing through found lays its pages out (Prototypes'), which the pane shows once it is known.
    if (report.flow && here()) await open(one)
    return [done, kind.told(report, { name: one.record.name, place: one.path }), said.line, waits && WAITS].filter(Boolean).join(' ')
  }

  /** The ones each run made, whose changes in that run are still their making, applied at once rather than waiting (D741). @type {WeakMap<AbortSignal, Set<string>>} */
  const making = new WeakMap()
  /** Whether a call's change waits for the person: one the run didn't make, where the run is the person's. @param {import('../../core/loop.js').ToolContext} ctx @param {string} path */
  const waits = (ctx, path) => Boolean(ctx.signal) && !making.get(/** @type {AbortSignal} */ (ctx.signal))?.has(path)
  /** What a call says of a change waiting for the person. */
  const WAITS = `This is your version, beside the task for the user to accept or reject; ${noun}_change goes on from it.`
  const Noun = noun[0].toUpperCase() + noun.slice(1)

  /** @type {import('../../core/loop.js').Tool} */
  const makeTool = {
    spec: kind.specs.make, kind: 'edit', ...(kind.for && { for: kind.for }),
    title: (args) => `${Noun} ${args?.name ?? ''}`,
    run: async (args, ctx) => {
      const list = Array.isArray(args?.files) ? args.files : [], name = String(args?.name ?? '').trim() || Noun, now = new Date().toISOString(), before = args?.[noun] ? await load(String(args[noun])) : null
      if (!list.length) throw new Error(`Give the ${noun} its files: index.html first, then style.css and the other pages.`)
      const files = new Map(await Promise.all(list.map((/** @type {any} */ file) => fileOf(file, ctx)))), path = before?.path ?? `${folder}/${ulid()}-${slug(name) || noun}`, wait = Boolean(before) && waits(ctx, path)
      if (!before && ctx.signal) making.set(ctx.signal, (making.get(ctx.signal) ?? new Set()).add(path))
      const theirs = wait ? await load(waitingOf(path)) : null
      return checked(before ? { ...before, files, record: { ...(theirs ?? before).record, name, changed: now, ...kind.more?.(args) } } : { dir: app.projectDir, path, files,
        record: { format: 1, name, author: 'jean', created: now, changed: now, source: conversationOf(ctx.signal)?.path ?? '', files: [], ...kind.more?.(args) } }, ctx, before ? 'Replaced.' : 'Made.',
      [...((wait ? theirs : before)?.files.keys() ?? [])], args?.look, wait)
    },
  }

  /** @type {import('../../core/loop.js').Tool} */
  const changeTool = {
    spec: kind.specs.change, kind: 'edit', ...(kind.for && { for: kind.for }),
    title: (args) => `Change the ${noun} ${args?.[noun] ?? ''}`,
    run: async (args, ctx) => {
      const one = await load(String(args?.[noun] ?? ''))
      if (!one) throw new Error(`There is no ${noun} at ${args?.[noun]}.`)
      // After the run that made it, the brain changes its own version, waiting for the person, made from the one kept the first time.
      const wait = waits(ctx, one.path), theirs = wait ? await load(waitingOf(one.path)) : null, base = theirs ?? one, done = changed(base.files, Array.isArray(args?.changes) ? args.changes : [])
      if ('error' in done) throw new Error(done.error)
      for (const file of Array.isArray(args?.files) ? args.files : []) done.files.set(...await fileOf(file, ctx))
      for (const path of Array.isArray(args?.remove) ? args.remove : []) done.files.delete(pathIn(path))
      return checked({ ...one, files: done.files, record: { ...base.record, changed: new Date().toISOString() } }, ctx, 'Changed.', [...((wait ? theirs : one)?.files.keys() ?? [])], args?.look, wait)
    },
  }

  /**
   * The note a message comes with while one is open beside the task, or just after its pane made way for the box: its page on show as
   * it is now, the brain's version while it waits, and the part the user points at, once. @param {import('../../core/types.js').Envelope[]} records
   */
  function notes(records) {
    const view = /** @type {(HTMLElement & { site?: Shown, page?: string, pointed?: Pointed | null }) | null} */ (document.querySelector(`app-preview ${kind.element}`))
    const was = asked?.task === app.current.peek()?.path ? asked : null, one = view?.site ?? was?.site, at = (view?.site ? view.page : was?.page) ?? 'index.html', part = view?.site ? view.pointed : was?.pointed
    asked = null
    if (!one) return []
    const text = `The ${noun} ${one.name} (${one.path}) is open beside the conversation, on ${at}.${one.mine ? ` Your version of it waits for the user to accept or reject; ${noun}_change goes on from it.` : ''}${part
      ? ` The user points at its <${part.name}> at ${part.place}${part.words ? `: “${part.words}”` : ''}.` : ''} Change it with ${noun}_change. Its files: ${[...one.files.keys()].join(', ')}. ${at} now:\n\n\`\`\`html\n${new TextDecoder().decode(one.files.get(at) ?? new Uint8Array())}\n\`\`\``
    const last = records.findLast(({ update: one }) => one?.sessionUpdate === '_system_note' && one.data?.kind === noun)
    return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: noun, uri: one.path })]
  }

  /** Its entry among the creations, which Creations draws and starts one with. */
  const entry = { id: kind.id, at: kind.at, draw: () => kind.glyph, kept, mention: noun, like: skill,
    pin: (/** @type {{ path: string }} */ { path }, /** @type {boolean} */ pinned) => update(path, (record) => ({ ...record, pinned })),
    rename: (/** @type {{ path: string }} */ { path }, /** @type {string} */ name) => update(path, (record) => ({ ...record, name })),
    remove: (/** @type {{ path: string }} */ { path }) => Promise.all([path, waitingOf(path)].map((one) => app.fs.remove(`${app.projectDir}/${one}`))),
    make: async () => { await skill(); await ask(`${words}.ask`, `${words}.example`) } }

  // Among the creations once the project holds one, from when its first is written; until then only its card to start one (D553).
  const joined = signal(/** @type {Record<string, unknown>} */ ({ starts: entry }))
  let here = ''
  /** It among the creations of the project open, `dir`, which holds one. @param {string} dir */
  const join = (dir) => { if (here === dir && !joined.peek().creations) joined.value = { creations: entry, main: page } }
  effect(() => {
    const dir = (void app.conversations.value, app.projectDir)
    if (dir !== here) (here = dir, (joined.value = { starts: entry }))
    if (!joined.peek().creations) kept().then((list) => list.length && join(dir), console.warn)
  })

  /** What Save gives: its first page, as one page. @param {string} path */
  const bytesOf = async (path) => ((one) => (one ? pageOf(one.files, 'index.html').then((page) => new TextEncoder().encode(page)) : null))(await load(path))
  return { PLACE, waitingOf, recordOf, load, write, serial, update, looksOf, kept, metaOf, bytesOf, editor, open, zip, fileOf, check, join, joined, notes, skill, tools: [makeTool, changeTool] }
}
