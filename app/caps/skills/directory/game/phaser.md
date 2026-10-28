# Phaser 4 in the game's frame

`import Phaser from 'phaser'` gives Phaser 4. Write it as Phaser 3, without what 4 removed:
- `setTintFill(c)`: now `setTint(c).setTintMode(Phaser.TintModes.FILL)`.
- `Phaser.Math.TAU` is 2π now, `PI2` is gone, `Phaser.Math.PI_OVER_2` is π/2.
- `Geom.Point` is gone: `Phaser.Math.Vector2`. `preFX`, `postFX`, `BitmapMask`, `Mesh`, `Plane`, `textures.generate()` are gone.
- Nothing loads: `this.load.*` fails. Draw every texture with Graphics, as below.
- Read controls from `host.input`, not `this.input.keyboard`, so touch and gamepads work too.

```js
import Phaser from 'phaser'

const TUNING = { speed: 240, gravity: 1100, jump: 470, every: 1400, faster: 0.95, fastest: 600 }
const WORDS = { title: 'Lantern Leap', start: 'Space: play · B: easier', over: 'The lantern went out', again: 'Space: again', best: 'Best' }
const W = 640, H = 360, n = new Intl.NumberFormat(host.lang)
const font = { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#ffffff', rtl: host.dir === 'rtl' }

// A texture from rows of characters, one colour per character.
function sprite (scene, key, rows, colours, size = 4) {
  if (scene.textures.exists(key)) return
  const g = scene.add.graphics()
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c in colours) g.fillStyle(colours[c]).fillRect(x * size, y * size, size, size) }))
  g.generateTexture(key, rows[0].length * size, rows.length * size)
  g.destroy()
}

class Title extends Phaser.Scene {
  constructor () { super('title') }
  create () {
    sprite(this, 'hero', ['.yy.', 'yooy', 'yyyy', 'y..y'], { y: 0xf7c531, o: 0x14141f })
    this.add.text(W / 2, 130, WORDS.title, { ...font, fontSize: '40px' }).setOrigin(0.5)
    this.add.text(W / 2, 200, WORDS.start, font).setOrigin(0.5)
  }
  update () {
    if (host.input.pressed('a') || host.input.pressed('b')) this.scene.start('play', { easy: host.input.pressed('b') })
  }
}

class Play extends Phaser.Scene {
  constructor () { super('play') }
  create ({ easy }) {
    this.speed = TUNING.speed * (easy ? 0.75 : 1)
    this.hero = this.physics.add.sprite(120, H - 40, 'hero').setCollideWorldBounds(true)
    this.points = 0
    this.label = this.add.text(12, 10, '', font)
    host.state('play')
  }
  update (time, delta) {
    const x = (host.input.down('right') ? 1 : 0) - (host.input.down('left') ? 1 : 0)
    this.hero.setVelocityX(x * this.speed)
    if (host.input.pressed('a') && this.hero.body.blocked.down) {
      this.hero.setVelocityY(-TUNING.jump)
      host.sound(1, 0.05, 520, 0.01, 0.05, 0.1, 0, 1.5, 8)
      this.tweens.add({ targets: this.hero, scaleY: host.reduced ? 1 : 1.25, duration: 80, yoyo: true })
    }
    this.points += delta / 1000
    this.label.setText(n.format(Math.floor(this.points)))
    host.score(Math.floor(this.points))
  }
  lose () {
    host.state('over')
    host.sound(1, 0.05, 140, 0.02, 0.2, 0.3, 3, 0.5)
    if (!host.reduced) this.cameras.main.shake(150, 0.006)
    this.time.delayedCall(400, () => this.scene.start('over', { points: Math.floor(this.points) }))
  }
}

class Over extends Phaser.Scene {
  constructor () { super('over') }
  create ({ points }) {
    const best = Math.max(points, host.load()?.best ?? 0)
    host.save({ best })
    this.add.text(W / 2, 140, `${WORDS.over}\n${n.format(points)} · ${WORDS.best} ${n.format(best)}\n${WORDS.again}`, { ...font, align: 'center' }).setOrigin(0.5)
  }
  update () { if (host.input.pressed('a')) this.scene.start('play', {}) }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: host.stage, width: W, height: H, backgroundColor: '#14141f', pixelArt: true, banner: false,
  physics: { default: 'arcade', arcade: { gravity: { y: TUNING.gravity } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true },
  scene: [Title, Play, Over],
})
```

Hits: `this.physics.add.overlap(a, b, fn)` and `collider`, with groups (`this.physics.add.group()`, `staticGroup()`).
Spawning: `this.time.addEvent({ delay, loop: true, callback })`. Juice: `this.tweens.add`, particles
(`this.add.particles(x, y, 'dot', { speed: 120, lifespan: 400, emitting: false }).explode(8)`).
