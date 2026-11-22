// SPDX-License-Identifier: MIT
// The game /games shows (./page.js), as Jean's skill "Make a game" has a brain write one: one module on a plain canvas, drawn and
// sounded from code, its numbers in TUNING, its words in WORDS, which the page fills in its language. It runs in a game's frame
// alone (app/caps/games), which gives it `host`.
const W = 640, H = 360, STEP = 1 / 60
const TUNING = { table: 7, rounds: 10, hearts: 3, safe: 4, basket: 330, fall: 62, faster: 1.1, fastest: 2, lanes: [140, 320, 500] }
const WORDS = /* WORDS */ {}
const COLOURS = { sky: '#12303a', ground: '#0b2129', leaf: '#3fa66b', apple: '#e5484d', basket: '#f7c531', ink: '#ffffff', soft: '#b9d3da' }
const said = new Intl.NumberFormat(host.lang)

const canvas = document.createElement('canvas'), g = canvas.getContext('2d')
host.stage.append(canvas)
const fit = () => {
  const scale = Math.min(innerWidth / W, innerHeight / H), ratio = devicePixelRatio || 1
  Object.assign(canvas.style, { width: `${W * scale}px`, height: `${H * scale}px`, display: 'block', margin: 'auto' })
  canvas.width = Math.round(W * scale * ratio); canvas.height = Math.round(H * scale * ratio)
  g.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0)
}
addEventListener('resize', fit); fit()

const game = { phase: 'title', x: W / 2, right: 0, hearts: TUNING.hearts, by: 2, apples: [], speed: 1, flash: 0, best: Number(host.load()?.best) || 0 }

/** Three apples for the sum being asked: its answer and two near it, each in a lane. */
function drop () {
  const answer = TUNING.table * game.by, near = [answer - TUNING.table, answer + TUNING.table, answer + 1, answer - 2].filter((n) => n > 0).sort(() => Math.random() - 0.5).slice(0, 2)
  const lanes = [...TUNING.lanes].sort(() => Math.random() - 0.5)
  game.apples = [answer, ...near].map((n, i) => ({ n, x: lanes[i], y: -30 - i * 34 }))
}
/** The next sum, never the one before. */
function ask () {
  let by = game.by
  while (by === game.by) by = 2 + Math.floor(Math.random() * 8)
  game.by = by
  drop()
}
function start () {
  Object.assign(game, { phase: 'play', x: W / 2, right: 0, hearts: TUNING.hearts, speed: 1, flash: 0 })
  host.score(0); host.state('play'); ask()
}
function end (phase) {
  game.phase = phase
  if (game.right > game.best) { game.best = game.right; host.save({ best: game.best }) }
  host.state(phase)
  if (phase === 'won') [523, 659, 784].forEach((pitch, i) => setTimeout(() => host.sound(0.6, 0, pitch, 0.01, 0.08, 0.2), i * 110))
  else host.sound(0.6, 0, 150, 0.02, 0.2, 0.4, 2)
}

function update (dt) {
  const move = (host.input.down('right') ? 1 : 0) - (host.input.down('left') ? 1 : 0)
  if (game.phase !== 'play') { if (host.input.pressed('a') || host.input.pressed('left') || host.input.pressed('right')) start(); return }
  game.x = Math.max(44, Math.min(W - 44, game.x + move * TUNING.basket * dt))
  game.flash = Math.max(0, game.flash - dt)
  for (const apple of game.apples) apple.y += TUNING.fall * game.speed * dt
  // Caught in the basket: the answer goes on to the next sum; another costs a heart, once the first sums are past.
  const caught = game.apples.find((apple) => apple.y > H - 74 && apple.y < H - 34 && Math.abs(apple.x - game.x) < 46)
  if (caught && caught.n === TUNING.table * game.by) {
    game.right++; host.score(game.right); game.flash = 0.25
    host.sound(0.6, 0, 520 + game.right * 30, 0.01, 0.05, 0.12)
    if (game.right % 3 === 0) game.speed = Math.min(TUNING.fastest, game.speed * TUNING.faster)
    if (game.right >= TUNING.rounds) end('won'); else ask()
  } else if (caught) {
    game.apples = game.apples.filter((apple) => apple !== caught)
    host.sound(0.5, 0, 180, 0.01, 0.08, 0.15, 2)
    if (game.right >= TUNING.safe && --game.hearts <= 0) end('over')
  }
  // Fallen past the basket, the same sum comes again.
  if (game.phase === 'play' && game.apples.every((apple) => apple.y > H + 30)) drop()
}

function words (text, x, y, size, colour = COLOURS.ink, weight = 700) {
  g.fillStyle = colour; g.font = `${weight} ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = host.dir
  g.fillText(text, x, y)
}
function draw () {
  g.fillStyle = COLOURS.sky; g.fillRect(0, 0, W, H)
  g.fillStyle = COLOURS.ground; g.fillRect(0, H - 26, W, 26)
  g.fillStyle = COLOURS.leaf; for (const x of [70, 250, 430, 590]) { g.beginPath(); g.ellipse(x, 6, 110, 34, 0, 0, Math.PI * 2); g.fill() }
  if (game.phase === 'play') {
    words(`${said.format(TUNING.table)} × ${said.format(game.by)}`, W / 2, 78, 40, game.flash ? COLOURS.basket : COLOURS.ink)
    for (const apple of game.apples) {
      g.fillStyle = COLOURS.apple; g.beginPath(); g.arc(apple.x, apple.y, 30, 0, Math.PI * 2); g.fill()
      g.fillStyle = COLOURS.leaf; g.beginPath(); g.ellipse(apple.x + 8, apple.y - 31, 9, 4, -0.6, 0, Math.PI * 2); g.fill()
      words(said.format(apple.n), apple.x, apple.y + 1, 26)
    }
    words(`${WORDS.right} ${said.format(game.right)} / ${said.format(TUNING.rounds)}`, 96, 66, 18, COLOURS.soft, 600)
    words('♥'.repeat(game.hearts), 60, 92, 20, COLOURS.apple)
  } else {
    words(game.phase === 'title' ? WORDS.title : game.phase === 'won' ? WORDS.won : WORDS.over, W / 2, 118, 44)
    words(game.phase === 'title' ? WORDS.how : `${WORDS.right} ${said.format(game.right)} / ${said.format(TUNING.rounds)}`, W / 2, 170, 22, COLOURS.soft, 500)
    words(game.phase === 'title' ? WORDS.start : WORDS.again, W / 2, 214, 22, COLOURS.basket, 600)
    if (game.best) words(`${WORDS.best} ${said.format(game.best)}`, W / 2, 256, 18, COLOURS.soft, 500)
  }
  // The basket, under everything it catches.
  g.fillStyle = COLOURS.basket; g.beginPath(); g.roundRect(game.x - 44, H - 62, 88, 34, [4, 4, 16, 16]); g.fill()
  g.strokeStyle = COLOURS.ground; g.lineWidth = 3; g.beginPath(); g.moveTo(game.x - 34, H - 50); g.lineTo(game.x + 34, H - 50); g.stroke()
}

let last = performance.now(), behind = 0
requestAnimationFrame(function frame (now) {
  behind = Math.min(behind + (now - last) / 1000, 0.25); last = now
  for (; behind >= STEP; behind -= STEP) update(STEP)
  draw()
  requestAnimationFrame(frame)
})
