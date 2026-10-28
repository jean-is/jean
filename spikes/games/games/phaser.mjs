import Phaser from 'phaser'
const TUNING = { speed: 220, fall: 140, every: 500 }
class Play extends Phaser.Scene {
  constructor () { super('play') }
  create () {
    const g = this.add.graphics()
    g.fillStyle(0xf7c531); g.fillRect(0, 0, 24, 24); g.generateTexture('me', 24, 24)
    g.clear(); g.fillStyle(0xe5484d); g.fillCircle(10, 10, 10); g.generateTexture('rock', 20, 20)
    g.destroy()
    this.me = this.physics.add.image(320, 330, 'me').setCollideWorldBounds(true)
    this.rocks = this.physics.add.group()
    this.keys = this.input.keyboard.createCursorKeys()
    this.points = 0
    this.label = this.add.text(12, 12, 'Score 0', { fontSize: '18px', color: '#ffffff' })
    this.time.addEvent({ delay: TUNING.every, loop: true, callback: () => { this.rocks.create(Phaser.Math.Between(10, 630), -10, 'rock').setVelocityY(TUNING.fall) } })
    this.physics.add.overlap(this.me, this.rocks, () => { jean.state('over'); this.scene.restart() })
    jean.state('play')
  }
  update (time, delta) {
    const v = (this.keys.left.isDown ? -1 : 0) + (this.keys.right.isDown ? 1 : 0)
    this.me.setVelocityX(v * TUNING.speed)
    if (this.keys.space.isDown) this.me.setTint(0x00ff00); else this.me.clearTint()
    this.points += delta / 1000
    this.label.setText(`Score ${Math.floor(this.points)}`)
    jean.score(Math.floor(this.points))
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: jean.stage, width: 640, height: 360, backgroundColor: '#1d1d2b', physics: { default: 'arcade' }, scale: { mode: Phaser.Scale.FIT }, audio: { noAudio: true }, banner: false, scene: [Play] })
