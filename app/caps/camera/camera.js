// The camera (docs/product.md, "Camera"; D645): the user shows Jean what is in front of them and talks about it, hands-free.
// Nothing is streamed to a brain. Each message sent while it is on shares the sharpest of its last frames, a picture in the
// task as any other (D105), or the larger one Look closely kept for it. While Jean watches, for what the user asked it to or
// for what they are doing, it looks on its own once the scene has moved and settled, or each minute (watch.js), and a look
// it has nothing to say about leaves nothing behind (ui/send.js's look). The video shows in <app-camera> (view.js): over the
// room on a touch screen, a tile beside the task elsewhere. It stops when it is closed, when another task or project opens,
// after ten minutes with nothing said, and when the page is hidden, where it waits for a tap to go on.
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, unlock } from '../../ui/caps.js'
import { app, effective, brainsHere, activeBrain, notify, send } from '../../ui/state.js'
import { live } from '../../ui/dictation.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { addFile } from '../../core/files.js'
import { noteRecord, linkedFiles } from '../../core/events.js'
import { t, useStrings, intlLocales } from '../../core/i18n.js'
import { luma, sharpness, difference, sharpest } from './frames.js'
import { watcher } from './watch.js'
import './view.js'

/** @import { Envelope, ResourceLink } from '../../core/types.js' */
/** @import { Attachment } from '../../ui/state.js' */

// Pages' sheet draws the box's mode chips, before a first message brings it.
await Promise.all([useStrings('camera'), styleSheet(new URL('../interactive/interactive.css', import.meta.url)), styleSheet(new URL('camera.css', import.meta.url))])

/** The longest side of what a message shares, of what a look shares, and of what Look closely keeps. */
const FRAME = 1024, LOOK = 768, CLOSE = 1568
/** How often the scene is sampled, how many frames are kept to pick from, and how long it stays on with nothing said. */
const SAMPLE_MS = 250, KEPT = 4, IDLE_MS = 600_000
/** What Jean watches for when the user presses Watch, rather than asking in words. */
const DOING = 'what the user is doing: tell them when a step is done or something goes wrong'

/** @typedef {'off' | 'starting' | 'on' | 'paused'} State paused: the page was hidden, and a tap goes on */
export const state = signal(/** @type {State} */ ('off'))
/** Over the room, as a viewfinder, else a tile beside the task. */
export const full = signal(false)
/** What this camera can do: turn around (there are two), and light the scene (a torch), lit or not. */
export const can = signal({ turn: false, light: false })
export const light = signal(false)
/** The picture shows as in a mirror: a camera that faces the user. Never what Jean gets. */
export const mirrored = signal(false)
/** The picture Look closely kept for the next message, with its preview. @type {import('@preact/signals-core').Signal<{ bytes: Uint8Array, url: string } | null>} */
export const kept = signal(null)
/** What Jean watches for, while it does. @type {import('@preact/signals-core').Signal<string | null>} */
export const watching = signal(null)

export const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true })
const touch = matchMedia('(pointer: coarse)')

/** @type {MediaStream | null} */
let stream = null
let facing = 'environment'
/** @type {WakeLockSentinel | null} */
let awake = null
let timer = 0
/** When the user last said something, or Jean last looked. */
let last = 0
/** The task the camera is on: another one closes it. @type {string | undefined} */
let task
/** The picture the last message shared, which a new task begins with. */
let sent = ''
/** Live conversation began with the camera, and ends with it. */
let talking = false
/** Watching ended on its own since the last message: it is told. */
let ended = false

/** Opens the camera, for a brain that can see, and talks hands-free unless the user already does. */
export async function open() {
  if (!['off', 'paused'].includes(state.peek())) return
  if (!brainsHere.value.length) return void (await import('../first/first.js')).open()
  const { seesPictures } = await import('../../ui/send.js')
  if (!(effective.peek().settings.auto ? brainsHere.peek() : [activeBrain.peek()]).some((brain) => brain && seesPictures(brain))) {
    notify(t('camera.blind'))
    return void (await import('../../ui/picker.js')).openPicker()
  }
  const resuming = state.peek() === 'paused'
  state.value = 'starting'
  try {
    await start()
  } catch (error) {
    console.warn('Camera', error)
    close()
    return notify(t(/** @type {any} */ (error)?.name === 'NotAllowedError' ? 'camera.denied' : 'camera.failed'))
  }
  if (resuming) return
  full.value = touch.matches
  task = app.current.peek()?.path
  if (!document.querySelector('app-camera')) document.body.append(document.createElement('app-camera'))
  if (live.peek() === 'off' && (await unlock('live'))) {
    talking = true
    await (await import('../live/live.js')).toggle()
  }
}

async function start() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
  const [track] = stream.getVideoTracks()
  video.srcObject = stream
  await video.play().catch(() => {})
  mirrored.value = track.getSettings().facingMode !== 'environment'
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput').length
  can.value = { turn: cameras > 1, light: Boolean(/** @type {any} */ (track.getCapabilities?.())?.torch) }
  light.value = false
  // The system took the camera (a call, another app): as when the page is hidden.
  track.addEventListener('ended', () => { if (state.peek() === 'on') pause() })
  awake = await navigator.wakeLock?.request('screen').catch(() => null) ?? null
  last = Date.now()
  state.value = 'on'
  timer = setInterval(sample, SAMPLE_MS)
}

/** Stops the tracks and lets go of every frame. */
function release() {
  clearInterval(timer)
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
  video.srcObject = null
  awake?.release().catch(() => {})
  awake = null
  for (const { frame } of frames) frame.close()
  frames = []
  previous = reference = null
}

/** Closes the camera: its picture kept goes, Jean stops watching, and talking stops if it began with it. */
export function close() {
  release()
  drop()
  watch = null
  watching.value = null
  state.value = 'off'
  if (talking && live.peek() !== 'off') import('../live/live.js').then((module) => module.toggle())
  talking = false
}

function pause() {
  release()
  state.value = 'paused'
}

/** Faces the other way. */
export async function turn() {
  facing = facing === 'environment' ? 'user' : 'environment'
  release()
  state.value = 'starting'
  await start().catch((error) => { console.warn('Camera', error); close(); notify(t('camera.failed')) })
}

export async function toggleLight() {
  const [track] = stream?.getVideoTracks() ?? []
  await track?.applyConstraints({ advanced: [/** @type {any} */ ({ torch: !light.peek() })] }).then(() => { light.value = !light.peek() }, console.warn)
}

// ─── Frames ──────────────────────────────────────────────────────────────────

/** The last frames, each FRAME pixels long at most, and how sharp. @type {{ frame: ImageBitmap, sharpness: number }[]} */
let frames = []
/** The scene, 32 by 24, at the sample before and when Jean last looked. @type {Uint8Array | null} */
let previous = null
/** @type {Uint8Array | null} */
let reference = null
const small = new OffscreenCanvas(160, 120)
const tiny = new OffscreenCanvas(32, 24)
let sampling = false

async function sample() {
  const { videoWidth: width, videoHeight: height } = video
  if (sampling || state.peek() !== 'on' || video.readyState < 2 || !width) return
  sampling = true
  try {
    small.height = Math.max(1, Math.round((160 * height) / width))
    const context = /** @type {OffscreenCanvasRenderingContext2D} */ (small.getContext('2d', { willReadFrequently: true }))
    context.drawImage(video, 0, 0, small.width, small.height)
    const scale = Math.min(1, FRAME / Math.max(width, height))
    const frame = await createImageBitmap(video, { resizeWidth: Math.round(width * scale), resizeHeight: Math.round(height * scale), resizeQuality: 'high' })
    if (state.peek() !== 'on') return frame.close()
    frames = [...frames, { frame, sharpness: sharpness(luma(context.getImageData(0, 0, small.width, small.height).data), small.width) }]
    while (frames.length > KEPT) frames.shift()?.frame.close()
    const shrunk = /** @type {OffscreenCanvasRenderingContext2D} */ (tiny.getContext('2d', { willReadFrequently: true }))
    shrunk.drawImage(small, 0, 0, tiny.width, tiny.height)
    const scene = luma(shrunk.getImageData(0, 0, tiny.width, tiny.height).data)
    const step = previous ? difference(scene, previous) : 1
    previous = scene
    reference ??= scene
    const now = Date.now()
    const next = watch?.(difference(scene, reference), step, now)
    if (next === 'look') look(scene)
    else if (next === 'end') stopWatching(true)
    else if (!watch && now - last > IDLE_MS) {
      close()
      notify(t('camera.idle'))
    }
  } finally {
    sampling = false
  }
}

/**
 * A frame as a JPEG no longer than `side`, drawn at once, so a frame let go meanwhile isn't missed.
 * @param {CanvasImageSource} source @param {number} width @param {number} height @param {number} side
 */
async function jpeg(source, width, height, side) {
  const scale = Math.min(1, side / Math.max(width, height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })).arrayBuffer())
}

/** A picture kept in the project, named for the moment, ready to share. @param {Uint8Array} bytes @returns {Promise<Attachment>} */
async function store(bytes) {
  const name = `${t('camera.picture', { time: new Intl.DateTimeFormat(intlLocales(), { timeStyle: 'medium' }).format(new Date()) })}.jpg`
  const link = await addFile(app.fs, { projectDir: app.projectDir, name, mimeType: 'image/jpeg', bytes, pages: [''], by: app.deviceId })
  return { key: crypto.randomUUID(), name, status: 'ready', link, pages: [''] }
}

/** A look's picture, which said nothing: it goes, its text and record with it. @param {ResourceLink} link */
function forget(link) {
  const base = `${app.projectDir}/${link.uri.replace(/\.[^./]+$/, '')}`
  return Promise.all([`${app.projectDir}/${link.uri}`, `${base}.md`, `${base}.meta.json`].map((path) => app.fs.remove(path).catch(() => {})))
}

/** Look closely: the camera's picture as large as it gives, up to CLOSE, kept for what the user says next. */
export async function closely() {
  if (state.peek() !== 'on' || !video.videoWidth) return
  const bytes = await jpeg(video, video.videoWidth, video.videoHeight, CLOSE)
  drop()
  kept.value = { bytes, url: URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'image/jpeg' })) }
}

/** The picture Look closely kept goes, unsent. */
export function drop() {
  if (kept.peek()) URL.revokeObjectURL(/** @type {{ url: string }} */ (kept.peek()).url)
  kept.value = null
}

/** What a message shares while the camera is on: the picture kept, else the sharpest of the last frames. @returns {Promise<Attachment[]>} */
async function shared() {
  // Just opened, before a frame was kept: the picture on screen.
  const frame = sharpest(frames) ?? (video.readyState >= 2 ? video : null)
  const close = kept.peek()
  if (state.peek() !== 'on' || (!close && !frame)) return []
  last = Date.now()
  const [width, height] = frame instanceof HTMLVideoElement ? [frame.videoWidth, frame.videoHeight] : [frame?.width ?? 0, frame?.height ?? 0]
  const bytes = close?.bytes ?? (await jpeg(/** @type {CanvasImageSource} */ (frame), width, height, FRAME))
  drop()
  const picture = await store(bytes)
  sent = picture.link?.uri ?? ''
  return [picture]
}

// ─── Watching ────────────────────────────────────────────────────────────────

/** @type {ReturnType<typeof watcher> | null} */
let watch = null
let looking = false

/** Jean watches for something, from now. @param {string} what */
export function startWatching(what) {
  watching.value = what
  watch = watcher(Date.now())
  ended = false
}

/** Jean stops watching: asked to, or after ten minutes, which it then says and is told. */
export function stopWatching(timed = false) {
  if (!watch) return
  watch = null
  watching.value = null
  if (timed) {
    ended = true
    notify(t('camera.watched'))
  }
}

/** Watch, pressed: for what the user is doing, or no longer. */
export const toggleWatching = () => (watch ? stopWatching() : startWatching(DOING))

/** A look on its own while Jean watches, when nothing else goes on: no answer at work, nothing being said or typed. @param {Uint8Array} scene */
async function look(scene) {
  const frame = sharpest(frames)
  if (looking || !frame || app.busy.peek() || !app.current.peek()?.records.length || app.draft.peek().trim() || !['off', 'listening'].includes(live.peek())) return
  looking = true
  reference = scene
  last = Date.now()
  try {
    const picture = await store(await jpeg(frame, frame.width, frame.height, LOOK))
    const note = noteRecord(`A look you took on your own, watching for ${watching.peek()}. Answer only if what you see now matters for it: a step done, something going wrong, what you watched for. Otherwise answer with nothing but "…".`, { kind: 'look' })
    if ((await send('', { files: [picture], notes: [note], look: true })) === false && picture.link) await forget(picture.link)
  } finally {
    looking = false
  }
}

/** @type {import('../../core/loop.js').Tool} */
const watchTool = {
  spec: {
    name: 'watch',
    description: "While the user's camera is on, look again on your own whenever what it shows has changed and settled, or each minute, for ten minutes at most, and speak only when it matters for what you watch for. Without `what`, stop watching.",
    parameters: { type: 'object', properties: { what: { type: 'string', description: 'What to watch for, in a few words: "the water boiling", "each step of the assembly, and mistakes".' } } },
  },
  kind: 'read',
  title: (args) => (args?.what ? `Watch for ${args.what}` : 'Stop watching'),
  run: async (args) => {
    const what = String(args?.what ?? '').trim()
    if (!what) return (stopWatching(), 'Stopped watching.')
    if (state.peek() !== 'on') return 'The camera is off: ask the user to turn it on first.'
    startWatching(what)
    return `Watching for ${what}. Tell the user in a few words that you will speak up.`
  },
}

// ─── The task and the box ────────────────────────────────────────────────────

/**
 * What the brain is told when the camera comes or goes, in full the first time in a task, and when watching ended on its own.
 * @param {Envelope[]} records
 */
function notes(records) {
  const on = state.peek() === 'on'
  const told = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data.kind === 'camera')?.update
  const was = told?.sessionUpdate === '_system_note' && told.data.kind === 'camera' && told.data.on
  const said = []
  if (ended) said.push(noteRecord('Watching ended after ten minutes.', { kind: 'camera', on: true }))
  ended = false
  if (on === Boolean(was)) return said
  const text = !on ? 'The user turned their camera off: their messages no longer come with a picture.'
    : told ? 'The user turned their camera on again: each of their messages comes with a picture of what it shows.'
      : 'The user turned on their camera: each of their messages now comes with a picture of what it shows as they send it, the latest being what is in front of them. They are likely talking hands-free, holding the phone or busy with their hands: answer briefly, a step at a time, as you would aloud. When you can\'t tell, say what you see and ask them to come closer, hold still or add light. Never say who someone is from their face.'
  return [...said, noteRecord(text, { kind: 'camera', on })]
}

/** At the foot of the box: while the camera is on, its chip, which closes it; else, on a touch screen, the button that opens it. */
const chip = () => (state.value !== 'off' ? html`<button type="button" class="mode-chip" aria-pressed="true" @click=${close}>${icons.camera}<span>${t('cap.camera.name')}</span>${icons.close}</button>`
  : touch.matches ? html`<button type="button" class="icon-button" aria-label=${t('camera.open')} @click=${open}>${icons.camera}</button>` : nothing)

/** Its row in +, checked while it is on. */
const row = () => html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" aria-pressed=${state.value !== 'off'}
  @click=${() => (state.peek() === 'off' ? open() : close())}>${icons.camera}<span>${t('cap.camera.name')}</span></button>`

// Another task or project closes it; not the new task the camera's own message began.
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
document.addEventListener('visibilitychange', () => { if (document.hidden && state.peek() === 'on') pause() })

register({
  id: 'camera',
  tools: [watchTool],
  lines: [{ name: 'watch', line: "while the user's camera is on, look again on your own for what they ask you to watch for, speaking only when it matters" }],
  slots: { modes: { at: 1, draw: chip, notes, files: shared }, add: { at: 1.5, draw: row } },
})
