// A film composed on the device, with no model: scenes (a picture, slow camera moves, a caption), crossfades and
// music rendered offline, encoded by the browser's own WebCodecs and written as MP4 by Mediabunny's writer alone.
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH, QUALITY_MEDIUM, canEncodeVideo, canEncodeAudio } from './mediabunny-mp4.min.mjs'

const FPS = 30
const FADE = 0.6

/** A picture to stand in for one made on this device: sky, sun and hills, in the palette given. */
function picture(width, height, [sky, glow, near, far], seed) {
  const canvas = new OffscreenCanvas(width, height)
  const g = canvas.getContext('2d')
  const gradient = g.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, sky)
  gradient.addColorStop(1, glow)
  g.fillStyle = gradient
  g.fillRect(0, 0, width, height)
  g.fillStyle = '#fff6d8'
  g.beginPath()
  g.arc(width * (0.25 + 0.5 * ((seed * 37) % 10) / 10), height * 0.32, height * 0.09, 0, Math.PI * 2)
  g.fill()
  for (const [color, base, amp] of [[far, 0.62, 0.06], [near, 0.75, 0.08]]) {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, height)
    for (let x = 0; x <= width; x += 8) g.lineTo(x, height * (base + amp * Math.sin(x / width * 6 + seed + base * 9)))
    g.lineTo(width, height)
    g.fill()
  }
  return canvas
}

/** Twelve seconds of music: an arpeggio over three chords, rendered offline. */
async function music(seconds) {
  const rate = 48000
  const context = new OfflineAudioContext(2, rate * seconds, rate)
  const chords = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]]
  const step = 0.25
  for (let i = 0; i * step < seconds - 0.5; i++) {
    const chord = chords[Math.floor(i * step / (seconds / chords.length)) % chords.length]
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'triangle'
    osc.frequency.value = chord[i % 3] * (i % 6 < 3 ? 1 : 2)
    const t = i * step
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
    osc.connect(gain).connect(context.destination)
    osc.start(t)
    osc.stop(t + 1)
  }
  return context.startRendering()
}

/** Draws the film at time t: each scene's picture zooming and panning slowly, the next fading in over it, its caption. */
function draw(g, scenes, t, width, height) {
  g.fillStyle = '#000'
  g.fillRect(0, 0, width, height)
  let start = 0
  for (const scene of scenes) {
    const end = start + scene.seconds
    if (t >= start - FADE && t < end) {
      const local = (t - start + FADE) / (scene.seconds + FADE)
      const zoom = 1.04 + 0.12 * local
      const w = width * zoom
      const h = height * zoom
      g.globalAlpha = Math.min(1, (t - start + FADE) / FADE)
      g.drawImage(scene.picture, (width - w) / 2 + scene.pan * (local - 0.5) * width * 0.06, (height - h) / 2, w, h)
      const shown = Math.min(1, Math.max(0, (t - start - 0.3) / 0.5))
      if (shown > 0) {
        g.globalAlpha = Math.min(g.globalAlpha, shown)
        const size = Math.round(height * 0.065)
        g.font = `600 ${size}px system-ui, "Hiragino Sans", "Geeza Pro", sans-serif`
        g.direction = scene.dir
        g.textAlign = 'center'
        const y = height * 0.88 - (1 - shown) * size * 0.4
        g.fillStyle = 'rgba(0,0,0,0.45)'
        const m = g.measureText(scene.caption)
        g.fillRect(width / 2 - m.width / 2 - size * 0.6, y - size * 1.05, m.width + size * 1.2, size * 1.5)
        g.fillStyle = '#fff'
        g.fillText(scene.caption, width / 2, y)
      }
      g.globalAlpha = 1
    }
    start = end
  }
}

/** Composes and encodes the film; resolves with its bytes and what it took. */
export async function compose({ width = 1920, height = 1080, codecString } = {}) {
  const palettes = [['#3d6fb6', '#f6c27a', '#2f5d3a', '#5d8a5a'], ['#1d2b53', '#e0715a', '#3a2a4a', '#6b4a6e'], ['#7fb7d9', '#fbe7b1', '#3c6e47', '#86a96b']]
  const scenes = [
    { caption: 'Our trip to the hills', dir: 'ltr', seconds: 4, pan: 1 },
    { caption: 'رحلتنا إلى التلال', dir: 'rtl', seconds: 4, pan: -1 },
    { caption: '丘への小さな旅', dir: 'ltr', seconds: 4, pan: 1 },
  ].map((scene, i) => ({ ...scene, picture: picture(width, height, palettes[i], i + 1) }))
  const seconds = scenes.reduce((sum, s) => sum + s.seconds, 0)

  const videoCodec = (await canEncodeVideo('avc', { width, height })) ? 'avc' : 'vp9'
  const audioCodec = (await canEncodeAudio('aac')) ? 'aac' : 'opus'
  const canvas = new OffscreenCanvas(width, height)
  const g = canvas.getContext('2d')
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH, ...(codecString && videoCodec === 'avc' && { fullCodecString: codecString }) })
  const audio = new AudioBufferSource({ codec: audioCodec, bitrate: QUALITY_MEDIUM })
  output.addVideoTrack(video, { frameRate: FPS })
  output.addAudioTrack(audio)

  const began = performance.now()
  const sound = await music(seconds)
  const rendered = performance.now()
  await output.start()
  for (let frame = 0; frame < seconds * FPS; frame++) {
    draw(g, scenes, frame / FPS, width, height)
    await video.add(frame / FPS, 1 / FPS)
  }
  await audio.add(sound)
  await output.finalize()
  const bytes = new Uint8Array(output.target.buffer)
  return { bytes, videoCodec: codecString ?? videoCodec, audioCodec, seconds, width, height, ms: { music: rendered - began, encode: performance.now() - rendered } }
}
