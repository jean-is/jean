import Phaser from 'phaser'

const TUNING = { speed: 240, gravity: 1100, jump: 470, every: 1400, faster: 0.95, fastest: 600 }
const WORDS = { title: 'Lantern Leap', start: 'Space: play · B: easier', over: 'The lantern went out', again: 'Space: again', best: 'Best' }
const W = 640, H = 360, n = new Intl.NumberFormat(jean.lang)
const font = { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#ffffff', rtl: jean.dir === 'rtl' }

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
    if (jean.input.pressed('a') || jean.input.pressed('b')) this.scene.start('play', { easy: jean.input.pressed('b') })
  }
}

class Play extends Phaser.Scene {
  constructor () { super('play') }
  create ({ easy }) {
    this.speed = TUNING.speed * (easy ? 0.75 : 1)
    this.hero = this.physics.add.sprite(120, H - 40, 'hero').setCollideWorldBounds(true)
    this.points = 0
    this.label = this.add.text(12, 10, '', font)
    jean.state('play')
  }
  update (time, delta) {
    const x = (jean.input.down('right') ? 1 : 0) - (jean.input.down('left') ? 1 : 0)
    this.hero.setVelocityX(x * this.speed)
    if (jean.input.pressed('a') && this.hero.body.blocked.down) {
      this.hero.setVelocityY(-TUNING.jump)
      jean.sound(1, 0.05, 520, 0.01, 0.05, 0.1, 0, 1.5, 8)
      this.tweens.add({ targets: this.hero, scaleY: jean.reduced ? 1 : 1.25, duration: 80, yoyo: true })
    }
    this.points += delta / 1000
    this.label.setText(n.format(Math.floor(this.points)))
    jean.score(Math.floor(this.points))
  }
  lose () {
    jean.state('over')
    jean.sound(1, 0.05, 140, 0.02, 0.2, 0.3, 3, 0.5)
    if (!jean.reduced) this.cameras.main.shake(150, 0.006)
    this.time.delayedCall(400, () => this.scene.start('over', { points: Math.floor(this.points) }))
  }
}

class Over extends Phaser.Scene {
  constructor () { super('over') }
  create ({ points }) {
    const best = Math.max(points, jean.load()?.best ?? 0)
    jean.save({ best })
    this.add.text(W / 2, 140, `${WORDS.over}\n${n.format(points)} · ${WORDS.best} ${n.format(best)}\n${WORDS.again}`, { ...font, align: 'center' }).setOrigin(0.5)
  }
  update () { if (jean.input.pressed('a')) this.scene.start('play', {}) }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: jean.stage, width: W, height: H, backgroundColor: '#14141f', pixelArt: true, banner: false,
  physics: { default: 'arcade', arcade: { gravity: { y: TUNING.gravity } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true },
  scene: [Title, Play, Over],
})
