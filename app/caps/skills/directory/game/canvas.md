# A game without an engine

Turns and rules (board, card, word and logic games) need no engine: plain HTML, or a canvas when
things move. Keep the state in one object and draw it from that object, never the other way round.

## On a canvas, with a fixed step

```js
const W = 640, H = 360, STEP = 1 / 60
const TUNING = { speed: 200 }
const canvas = document.createElement('canvas'), g = canvas.getContext('2d')
host.stage.append(canvas)
const fit = () => {
  const scale = Math.min(innerWidth / W, innerHeight / H), ratio = devicePixelRatio || 1
  Object.assign(canvas.style, { width: `${W * scale}px`, height: `${H * scale}px`, display: 'block', margin: 'auto' })
  canvas.width = Math.round(W * scale * ratio); canvas.height = Math.round(H * scale * ratio)
  g.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0)
}
addEventListener('resize', fit); fit()

const game = { phase: 'title', x: W / 2, points: 0 }
function update (dt) {
  if (game.phase === 'title' && host.input.pressed('a')) { Object.assign(game, { phase: 'play', x: W / 2, points: 0 }); host.state('play') }
  if (game.phase !== 'play') return
  game.x += ((host.input.down('right') ? 1 : 0) - (host.input.down('left') ? 1 : 0)) * TUNING.speed * dt
}
function draw () {
  g.fillStyle = '#14141f'; g.fillRect(0, 0, W, H)
  g.fillStyle = '#f7c531'; g.fillRect(game.x - 12, H - 40, 24, 24)
  g.fillStyle = '#ffffff'; g.font = '20px system-ui, sans-serif'; g.direction = host.dir
  g.fillText(String(game.points), 12, 28)
}
let last = performance.now(), behind = 0
requestAnimationFrame(function frame (now) {
  behind = Math.min(behind + (now - last) / 1000, 0.25); last = now
  for (; behind >= STEP; behind -= STEP) update(STEP)
  draw()
  requestAnimationFrame(frame)
})
```

`host.input.pressed()` holds for one frame of the clock: read it in `update`, once per step.

## In HTML

For cards, tiles and words, build elements with `document.createElement`, style them with one
`<style>` element, and give every button 44 pixels or more. Play by keys too: `host.input.on('left', …)`
moves a highlight, `host.input.on('a', …)` chooses. Set `dir="auto"` on text the player writes.
Shuffle with Fisher–Yates on `Math.random()`, and check a level can be won before showing it.
