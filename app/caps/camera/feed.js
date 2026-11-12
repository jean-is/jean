// SPDX-License-Identifier: MIT
// What the camera (D645) and a shared screen (D699) have in common, each a feed of pictures for the task: what a message
// shares is kept as a picture, as any other (D105); while Jean watches, it looks on its own once what the feed shows has
// moved and settled, or each minute (watch.js), and a look it has nothing to say about leaves nothing behind; the brain is
// told when the feed comes and goes; and it ends when another task or project opens, or after ten minutes with nothing said.
// Each capability samples its own source, draws its own view and says its own words.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, notify, send } from '../../ui/state.js'
import { live } from '../../ui/dictation.js'
import { addFile } from '../../core/files.js'
import { noteRecord, linkedFiles } from '../../core/events.js'
import { t, intlLocales } from '../../core/i18n.js'
import { difference } from './frames.js'
import { watcher, WATCH } from './watch.js'

/** @import { Envelope, ResourceLink } from '../../core/types.js' */
/** @import { Attachment } from '../../ui/state.js' */

/** How long a feed stays on with nothing said and no watching. */
const IDLE_MS = 600_000

/**
 * A picture of `source` as `type`, no longer than `side`, drawn at once, so a frame let go meanwhile isn't missed.
 * @param {CanvasImageSource} source @param {number} width @param {number} height @param {number} side @param {string} [type]
 */
export async function encode(source, width, height, side, type = 'image/jpeg') {
  const scale = Math.min(1, side / Math.max(width, height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
  // Words on a screen, and edges in a photo, stay readable when it is scaled down smoothly.
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Uint8Array(await (await canvas.convertToBlob({ type, quality: 0.8 })).arrayBuffer())
}

/** A tile's or a viewfinder's button, named by its tip (D233). @param {unknown} glyph @param {string} key @param {() => unknown} run @param {boolean} [pressed] */
export const button = (glyph, key, run, pressed) => html`<button type="button" class="icon-button" aria-label=${t(key)}
  aria-pressed=${pressed === undefined ? nothing : String(pressed)} @click=${run}>${glyph}</button>`

/**
 * @typedef {Object} Options
 * @property {'camera' | 'screen'} kind  its notes' kind, and its looks'
 * @property {() => void} close  ends it
 * @property {() => Promise<Attachment> | null} shot  a look's picture, kept, if there is one to take now
 * @property {(time: string) => string} named  a picture's name, by when it was taken
 * @property {(what: string) => string} looked  what the brain reads with a look it took on its own
 * @property {{ first: string, again: string, off: string, ended: string }} told  what the brain reads when it comes the first time in
 *   a task and again, when it goes, and when watching ended on its own
 * @property {() => string} watched  what the user reads when watching ended on its own
 * @property {() => string} idle  and when it closed, unused
 * @property {{ name: string, description: string, examples: string, absent: string }} tool  its watch tool: its name, what it does, what
 *   it may watch for, and what the brain reads when nothing shows
 * @property {Record<keyof typeof WATCH, number>} [thresholds]  how far it must move and keep still (watch.js)
 */

/** @param {Options} options */
export function feed({ kind, close, shot, named, looked, told, watched, idle, tool, thresholds = WATCH }) {
  /** paused: the page was hidden, and a tap goes on (the camera's). */
  const state = signal(/** @type {'off' | 'starting' | 'on' | 'paused'} */ ('off'))
  /** What Jean watches for, while it does. */
  const watching = signal(/** @type {string | null} */ (null))
  /** @type {ReturnType<typeof watcher> | null} */
  let watch = null
  let looking = false
  /** Watching ended on its own since the last message: the brain is told. */
  let ended = false
  /** When the user last said something, or Jean last looked. */
  let last = 0
  /** The task it is on: another one ends it. @type {string | undefined} */
  let task
  /** The picture the last message shared, which a new task begins with. */
  let sent = ''
  /** The scene at the sample before, and when Jean last looked. @type {Uint8Array | null} */
  let previous = null
  /** @type {Uint8Array | null} */
  let reference = null

  /** Jean watches for something, from now. @param {string} what */
  const start = (what) => {
    watching.value = what
    watch = watcher(Date.now(), thresholds)
    ended = false
  }

  /** Jean stops watching: asked to, or after ten minutes, which it then says and is told. */
  const stop = (timed = false) => {
    if (!watch) return
    watch = watching.value = null
    if (!timed) return
    ended = true
    notify(watched())
  }

  /** A look's picture, which said nothing: it goes, its text and record with it. @param {ResourceLink} link */
  const forget = (link) => {
    const base = `${app.projectDir}/${link.uri.replace(/\.[^./]+$/, '')}`
    return Promise.all([`${app.projectDir}/${link.uri}`, `${base}.md`, `${base}.meta.json`].map((path) => app.fs.remove(path).catch(() => {})))
  }

  /** A look on its own while Jean watches, when nothing else goes on: no answer at work, nothing being said or typed. @param {Uint8Array} scene */
  async function look(scene) {
    if (looking || app.busy.peek() || !app.current.peek()?.records.length || app.draft.peek().trim() || !['off', 'listening'].includes(live.peek())) return
    const taking = shot()
    if (!taking) return
    looking = true
    reference = scene
    last = Date.now()
    try {
      const picture = await taking
      const note = noteRecord(looked(String(watching.peek())), { kind: 'look', cap: kind })
      if ((await send('', { files: [picture], notes: [note], look: true })) === false && picture.link) await forget(picture.link)
    } finally {
      looking = false
    }
  }

  // Another task or project ends it; not the new task its own message began.
  effect(() => {
    const path = app.current.value?.path
    if (path === task || state.peek() === 'off') return void (task = path)
    const begun = !task && linkedFiles(app.current.value?.records ?? []).some((link) => link.uri === sent)
    task = path
    if (!begun) close()
  })
  let dir = app.projectDir
  effect(() => {
    if (app.project.value.dir !== dir && state.peek() !== 'off') close()
    dir = app.project.value.dir
  })

  return {
    state,
    watching,
    /** Watch, pressed: for `what`, or no longer. @param {string} what */
    toggle: (what) => (watch ? stop() : start(what)),
    /** It began showing, in the task on screen: Jean's watching stops when it ends. */
    started() {
      task = app.current.peek()?.path
      last = Date.now()
    },
    /** It no longer shows anything for now: what it compared goes. */
    reset() {
      previous = reference = null
    },
    /** Jean no longer watches, as it ends. */
    stop: () => stop(),
    /** One sample of what it shows, shrunk: Jean may look, watching may end, or it may close, unused. @param {Uint8Array} scene */
    sampled(scene) {
      const step = previous ? difference(scene, previous) : 1
      previous = scene
      reference ??= scene
      const now = Date.now()
      const next = watch?.(difference(scene, reference), step, now)
      if (next === 'look') look(scene)
      else if (next === 'end') stop(true)
      else if (!watch && now - last > IDLE_MS) {
        close()
        notify(idle())
      }
    },
    /** Bytes of what it shows, kept in the project as a picture ready to share, named for the moment. @param {Uint8Array} bytes @param {string} type @returns {Promise<Attachment>} */
    async keep(bytes, type) {
      const name = `${named(new Intl.DateTimeFormat(intlLocales(), { timeStyle: 'medium' }).format(new Date()))}.${type === 'image/png' ? 'png' : 'jpg'}`
      const link = await addFile(app.fs, { projectDir: app.projectDir, name, mimeType: type, bytes, pages: [''], by: app.deviceId })
      return { key: crypto.randomUUID(), name, status: 'ready', link, pages: [''] }
    },
    /** A message shares what it shows now: the user said something. @param {Attachment} picture */
    shared(picture) {
      last = Date.now()
      sent = picture.link?.uri ?? ''
      return [picture]
    },
    /**
     * What the brain is told when it comes or goes, in full the first time in a task, and when watching ended on its own.
     * @param {Envelope[]} records
     */
    notes(records) {
      const on = state.peek() === 'on'
      const said = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === kind)?.update
      const was = said?.sessionUpdate === '_system_note' && said.data.kind === kind && said.data.on
      const notes = ended ? [noteRecord(told.ended, { kind, on: true })] : []
      ended = false
      if (on === Boolean(was)) return notes
      return [...notes, noteRecord(!on ? told.off : said ? told.again : told.first, { kind, on })]
    },
    /** @type {import('../../core/loop.js').Tool} */
    tool: {
      spec: {
        name: tool.name,
        description: tool.description,
        parameters: { type: 'object', properties: { what: { type: 'string', description: `What to watch for, in a few words: ${tool.examples}.` } } },
      },
      kind: 'read',
      title: (args) => (args?.what ? `Watch for ${args.what}` : 'Stop watching'),
      run: async (args) => {
        const what = String(args?.what ?? '').trim()
        if (!what) return (stop(), 'Stopped watching.')
        if (state.peek() !== 'on') return tool.absent
        start(what)
        return `Watching for ${what}. Tell the user in a few words that you will speak up.`
      },
    },
  }
}
