// The camera (docs/product.md, "Camera"; D645): the user shows Jean what is in front of them and talks about it, hands-free.
// Nothing is streamed to a brain. Each message sent while it is on shares the sharpest of its last frames, a picture in the
// task as any other (D105), or the larger one Look closely kept for it. While Jean watches, for what the user asked it to or
// for what they are doing, it looks on its own once the scene has moved and settled, or each minute (watch.js), and a look
// it has nothing to say about leaves nothing behind (ui/send.js's look). The video shows in <app-camera> (view.js): over the
// room on a touch screen, a tile beside the task elsewhere. It stops when it is closed, when another task or project opens,
// after ten minutes with nothing said, and when the page is hidden, where it waits for a tap to go on. What it does as a
// shared screen does (D699) is feed.js's.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register, unlock } from '../../ui/caps.js'
import { effective, brainsHere, activeBrain, notify } from '../../ui/state.js'
import { live } from '../../ui/dictation.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, useStrings } from '../../core/i18n.js'
import { luma, sharpness, sharpest } from './frames.js'
import { feed, encode } from './feed.js'
import './view.js'

/** @import { Attachment } from '../../ui/state.js' */

// Pages' sheet draws the box's mode chips, before a first message brings it.
await Promise.all([useStrings('camera'), styleSheet(new URL('../interactive/interactive.css', import.meta.url)), styleSheet(new URL('camera.css', import.meta.url))])

/** The longest side of what a message shares, of what a look shares, and of what Look closely keeps. */
const FRAME = 1024, LOOK = 768, CLOSE = 1568
/** How often the scene is sampled, and how many frames are kept to pick from. */
const SAMPLE_MS = 250, KEPT = 4
/** What Jean watches for when the user presses Watch, rather than asking in words. */
const DOING = 'what the user is doing: tell them when a step is done or something goes wrong'

/** Over the room, as a viewfinder, else a tile beside the task. */
export const full = signal(false)
/** What this camera can do: turn around (there are two), and light the scene (a torch), lit or not. */
export const can = signal({ turn: false, light: false })
export const light = signal(false)
/** The picture shows as in a mirror: a camera that faces the user. Never what Jean gets. */
export const mirrored = signal(false)
/** The picture Look closely kept for the next message, with its preview. @type {import('@preact/signals-core').Signal<{ bytes: Uint8Array, url: string } | null>} */
export const kept = signal(null)

// Not muted, the stream having no sound: WebKit on Linux never plays a muted video out of view.
export const video = Object.assign(document.createElement('video'), { playsInline: true, autoplay: true })
const touch = matchMedia('(pointer: coarse)')

/** @type {MediaStream | null} */
let stream = null
let facing = 'environment'
/** @type {WakeLockSentinel | null} */
let awake = null
let timer = 0
/** Live conversation began with the camera, and ends with it. */
let talking = false

/** The last frames, each FRAME pixels long at most, and how sharp. @type {{ frame: ImageBitmap, sharpness: number }[]} */
let frames = []

const camera = feed({
  kind: 'camera',
  close,
  shot: () => {
    const frame = sharpest(frames)
    return frame ? encode(frame, frame.width, frame.height, LOOK).then((bytes) => camera.keep(bytes, 'image/jpeg')) : null
  },
  named: (time) => t('camera.picture', { time }),
  looked: (what) => `A look you took on your own, watching for ${what}. Answer only if what you see now matters for it: a step done, something going wrong, what you watched for. Otherwise answer with nothing but "…".`,
  told: {
    first: 'The user turned on their camera: each of their messages now comes with a picture of what it shows as they send it, the latest being what is in front of them. They are likely talking hands-free, holding the phone or busy with their hands: answer briefly, a step at a time, as you would aloud. When you can\'t tell, say what you see and ask them to come closer, hold still or add light. Never say who someone is from their face. To show where something is, cite the picture\'s area as [n: x,y,w,h], n its source number, in percent from its top left: it shows boxed in your answer.',
    again: 'The user turned their camera on again: each of their messages comes with a picture of what it shows.',
    off: 'The user turned their camera off: their messages no longer come with a picture.',
    ended: 'Watching ended after ten minutes.',
  },
  watched: () => t('camera.watched'),
  idle: () => t('camera.idle'),
  tool: {
    name: 'watch',
    description: "While the user's camera is on, look again on your own whenever what it shows has changed and settled, or each minute, for ten minutes at most, and speak only when it matters for what you watch for. Without `what`, stop watching.",
    examples: '"the water boiling", "each step of the assembly, and mistakes"',
    absent: 'The camera is off: ask the user to turn it on first.',
  },
})
/** paused: the page was hidden, and a tap goes on. What Jean watches for, while it does. */
export const { state, watching } = camera

/** Opens the camera, for a brain that can see, and talks hands-free unless the user already does. */
export async function open() {
  if (!['off', 'paused'].includes(state.peek())) return
  if (!brainsHere.value.length) return void (await import('../first/first.js')).open()
  const { seesPictures } = await import('../../ui/send.js')
  if (!(effective.peek().settings.auto ? brainsHere.peek() : [activeBrain.peek()]).some((brain) => brain && seesPictures(brain))) {
    notify(t('camera.blind'), { alert: true })
    return void (await import('../../ui/picker.js')).openPicker()
  }
  const resuming = state.peek() === 'paused'
  state.value = 'starting'
  try {
    await start()
  } catch (error) {
    console.warn('Camera', error)
    close()
    return notify(t(/** @type {any} */ (error)?.name === 'NotAllowedError' ? 'camera.denied' : 'camera.failed'), { alert: true })
  }
  if (resuming) return
  full.value = touch.matches
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
  camera.started()
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
  camera.reset()
}

/** Closes the camera: its picture kept goes, Jean stops watching, and talking stops if it began with it. */
export function close() {
  release()
  drop()
  camera.stop()
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
  await start().catch((error) => { console.warn('Camera', error); close(); notify(t('camera.failed'), { alert: true }) })
}

export async function toggleLight() {
  const [track] = stream?.getVideoTracks() ?? []
  await track?.applyConstraints({ advanced: [/** @type {any} */ ({ torch: !light.peek() })] }).then(() => { light.value = !light.peek() }, console.warn)
}

// ─── Frames ──────────────────────────────────────────────────────────────────

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
    // The scene, 32 by 24.
    camera.sampled(luma(shrunk.getImageData(0, 0, tiny.width, tiny.height).data))
  } finally {
    sampling = false
  }
}

/** Look closely: the camera's picture as large as it gives, up to CLOSE, kept for what the user says next. */
export async function closely() {
  if (state.peek() !== 'on' || !video.videoWidth) return
  const bytes = await encode(video, video.videoWidth, video.videoHeight, CLOSE)
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
  const [width, height] = frame instanceof HTMLVideoElement ? [frame.videoWidth, frame.videoHeight] : [frame?.width ?? 0, frame?.height ?? 0]
  const bytes = close?.bytes ?? (await encode(/** @type {CanvasImageSource} */ (frame), width, height, FRAME))
  drop()
  return camera.shared(await camera.keep(bytes, 'image/jpeg'))
}

/** Watch, pressed: for what the user is doing, or no longer. */
export const toggleWatching = () => camera.toggle(DOING)

// ─── The task and the box ────────────────────────────────────────────────────

/** At the foot of the box: while the camera is on, its chip, which closes it; else, on a touch screen, the button that opens it. */
const chip = () => (state.value !== 'off' ? html`<button type="button" class="mode-chip" aria-pressed="true" @click=${close}>${icons.camera}<span>${t('cap.camera.name')}</span>${icons.close}</button>`
  : touch.matches ? html`<button type="button" class="icon-button" aria-label=${t('camera.open')} @click=${open}>${icons.camera}</button>` : nothing)

/** Its row in +, among what shows Jean something live, ticked while it is on. */
const row = () => html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" aria-pressed=${state.value !== 'off'}
  @click=${() => (state.peek() === 'off' ? open() : close())}>${icons.camera}<span>${t('cap.camera.name')}</span>${state.value !== 'off' ? icons.check : nothing}</button>`

document.addEventListener('visibilitychange', () => { if (document.hidden && state.peek() === 'on') pause() })

register({
  id: 'camera',
  tools: [camera.tool],
  lines: [{ name: 'watch', line: "while the user's camera is on, look again on your own for what they ask you to watch for, speaking only when it matters" }],
  slots: { modes: { at: 1, draw: chip, notes: camera.notes, files: shared }, add: { at: 2, draw: row } },
})
