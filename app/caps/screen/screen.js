// SPDX-License-Identifier: MIT
// Screen sharing (docs/product.md, "Screen sharing"; D699): the user shows Jean a window, a tab or their whole screen as they
// work in another app, and Jean guides them through it. It is a feed as the camera is (caps/camera/feed.js): nothing is
// streamed to a brain, each message sent while it is on shares a picture of what it shows, and while Jean watches it looks
// on its own once the screen has changed and settled, with a screen's thresholds. Jean only sees: it never clicks or types
// there. <app-screen> is a tile at a corner showing what is shared, with the camera tile's look (camera.css). Sharing ends
// from the browser's own bar, from the tile or the box's chip, when another task or project opens, and after ten minutes
// with nothing said; the page being hidden is how it is used, so it goes on then.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { Element, define } from '../../ui/base.js'
import { effective, brainsHere, activeBrain, notify } from '../../ui/state.js'
import { seesPictures } from '../../ui/send.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, useStrings } from '../../core/i18n.js'
import { luma } from '../camera/frames.js'
import { WATCH } from '../camera/watch.js'
import { feed, encode, button } from '../camera/feed.js'

// The box's mode chips, before a first message brings their sheet; the camera's tile, which this one is.
await Promise.all(['../interactive/interactive.css', '../camera/camera.css', 'screen.css'].map((path) => styleSheet(new URL(path, import.meta.url))).concat(useStrings('screen')))

/** The longest side of what a message shares and of what a look shares, as a PNG: a screen's words stay readable. */
const SIDE = 1568, LOOK = 1280
/** How often the screen is sampled. */
const SAMPLE_MS = 500
/** What Jean watches for when the user presses Watch, rather than asking in words. */
const DOING = 'what the user does on their screen: tell them when a step is done, what comes next, or when something goes wrong'
/** The tile's corners, in the order its Move button goes round them: it starts away from the camera's. */
const CORNERS = ['bottom-end', 'bottom-start', 'top-start', 'top-end']
const corner = signal(CORNERS[0])

// Not muted, the stream having no sound: WebKit on Linux never plays a muted video out of view.
const video = Object.assign(document.createElement('video'), { playsInline: true, autoplay: true })
/** @type {MediaStream | null} */
let stream = null
let timer = 0
const tiny = new OffscreenCanvas(64, 40)

/** What the screen shows now, as a PNG no longer than `side`, kept in the project; none before its first frame. @param {number} side */
const picture = (side) => (video.readyState < 2 || !video.videoWidth ? null
  : encode(video, video.videoWidth, video.videoHeight, side, 'image/png').then((bytes) => screen.keep(bytes, 'image/png')))

const screen = feed({
  kind: 'screen',
  close,
  shot: () => picture(LOOK),
  named: (time) => t('screen.picture', { time }),
  looked: (what) => `A look you took on your own at the user's screen, watching for ${what}. Answer only if what you see now matters for it: a step done, the next one, something going wrong. Otherwise answer with nothing but "…".`,
  told: {
    first: 'The user is sharing their screen: each of their messages now comes with a picture of what it shows as they send it, the latest being what they see now. They are likely working in another app and asking how to do something there: guide them a step at a time, naming each button, menu or field as it reads on the screen and where it is. You only see it: you can\'t click or type there, so never offer to. Never repeat a password, code or card number it shows. To show where something is, cite the picture\'s area as [n: x,y,w,h], n its source number, in percent from its top left: it shows boxed in your answer.',
    again: 'The user shares their screen again: each of their messages comes with a picture of it.',
    off: 'The user stopped sharing their screen: their messages no longer come with a picture of it.',
    ended: 'Watching the screen ended after ten minutes.',
  },
  watched: () => t('screen.watched'),
  idle: () => t('screen.idle'),
  tool: {
    name: 'watch_screen',
    description: 'While the user shares their screen, look again on your own whenever it has changed and settled, or each minute, for ten minutes at most, and speak only when it matters for what you watch for. Without `what`, stop watching.',
    examples: '"each step of the export, and mistakes", "the upload finishing"',
    absent: 'The user isn\'t sharing their screen: ask them to share it first.',
  },
  // A screen changes in parts, a menu, a dialog, a page: that is a step, typing and a blinking caret aren't.
  thresholds: { ...WATCH, moved: 0.01, still: 0.002 },
})
const { state, watching } = screen

/**
 * The browser asks which window, tab or screen to share, for a brain that can see. Called from a click, which the browser
 * wants: nothing is awaited before it asks.
 */
export async function choose() {
  if (state.peek() !== 'off') return
  if (!brainsHere.value.length) return void (await import('../first/first.js')).open()
  if (!(effective.peek().settings.auto ? brainsHere.peek() : [activeBrain.peek()]).some((brain) => brain && seesPictures(brain))) {
    notify(t('screen.blind'), { alert: true })
    return void (await import('../../ui/picker.js')).openPicker()
  }
  state.value = 'starting'
  const controller = 'CaptureController' in globalThis ? new (/** @type {any} */ (globalThis).CaptureController)() : undefined
  // Stay in Jean once something is picked: Chrome would bring it to the front.
  try { controller?.setFocusBehavior?.('no-focus-change') } catch {}
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(/** @type {DisplayMediaStreamOptions} */ ({ video: { displaySurface: 'window' }, audio: false, selfBrowserSurface: 'exclude', controller }))
  } catch (error) {
    state.value = 'off'
    // Closing the browser's picker isn't a failure.
    return void (/** @type {{ name?: string } | undefined} */ (error)?.name !== 'NotAllowedError' && notify(t('screen.failed'), { alert: true }))
  }
  // Stop sharing, in the browser's own bar.
  stream.getVideoTracks()[0]?.addEventListener('ended', close)
  video.srcObject = stream
  await video.play().catch(() => {})
  screen.started()
  state.value = 'on'
  timer = setInterval(sample, SAMPLE_MS)
  if (!document.querySelector('app-screen')) document.body.append(document.createElement('app-screen'))
}

/** Sharing ends: the tracks stop, and Jean stops watching. */
export function close() {
  clearInterval(timer)
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
  video.srcObject = null
  screen.reset()
  screen.stop()
  state.value = 'off'
}

/** The screen, shrunk to 64 by 40, which may make Jean look. */
function sample() {
  if (state.peek() !== 'on' || video.readyState < 2 || !video.videoWidth) return
  const context = /** @type {OffscreenCanvasRenderingContext2D} */ (tiny.getContext('2d', { willReadFrequently: true }))
  context.drawImage(video, 0, 0, tiny.width, tiny.height)
  screen.sampled(luma(context.getImageData(0, 0, tiny.width, tiny.height).data))
}

/** What a message shares while sharing is on: the screen as it is now. */
async function shared() {
  const taking = state.peek() === 'on' && picture(SIDE)
  return taking ? screen.shared(await taking) : []
}

/** At the foot of the box, while sharing is on: its chip, which ends it. */
const chip = () => (state.value !== 'off' ? html`<button type="button" class="mode-chip" aria-pressed="true" @click=${close}>${icons.screen}<span>${t('cap.screen.name')}</span>${icons.close}</button>` : nothing)

/** Its row in +, among what shows Jean something live, named as its chip is and ticked while it is on. */
const row = () => html`<button type="button" popovertarget="add-menu" popovertargetaction="hide" aria-pressed=${state.value !== 'off'}
  @click=${() => (state.peek() === 'off' ? choose() : close())}>${icons.screen}<span>${t('cap.screen.name')}</span>${state.value !== 'off' ? icons.check : nothing}</button>`

/** What is shared, as Jean sees it, that sharing is on and whether Jean watches, in words, and its buttons. */
class Screen extends Element {
  render() {
    if (state.value === 'off') return nothing
    const watched = Boolean(watching.value)
    return html`<aside class="camera is-tile screen" data-corner=${corner.value} aria-label=${t('cap.screen.name')}>
      <div class="camera-view">${video}</div>
      <p class="camera-state" role="status">${watched ? icons.eye : html`<span class="camera-dot"></span>`}<span>${t(watched ? 'screen.watching' : 'cap.screen.name')}</span></p>
      <div class="camera-buttons">
        ${button(icons.eye, 'screen.watch', () => screen.toggle(DOING), watched)}
        ${button(icons.move, 'screen.move', () => { corner.value = CORNERS[(CORNERS.indexOf(corner.peek()) + 1) % CORNERS.length] })}
        ${button(icons.close, 'screen.close', close)}
      </div>
    </aside>`
  }
}
define('app-screen', Screen)

register({
  id: 'screen',
  tools: [screen.tool],
  lines: [{ name: 'watch_screen', line: 'while the user shares their screen, look again on your own for what they ask you to watch for, speaking only when it matters' }],
  slots: { modes: { at: 1.1, draw: chip, notes: screen.notes, files: shared }, add: { at: 2.1, draw: row } },
})
