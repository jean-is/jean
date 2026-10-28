const c = document.createElement('canvas')
c.width = 640; c.height = 360
jean.stage.append(c)
const g = c.getContext('2d')
let x = 320
jean.state('play')
const loop = () => {
  if (jean.input.down('left')) x -= 4
  if (jean.input.down('right')) x += 4
  g.fillStyle = '#1d1d2b'; g.fillRect(0, 0, 640, 360)
  g.fillStyle = jean.input.down('a') ? '#4c4' : '#f7c531'; g.fillRect(x - 12, 300, 24, 24)
  g.fillStyle = '#fff'; g.font = '18px system-ui'; g.fillText('Attrape les étoiles', 12, 24)
  requestAnimationFrame(loop)
}
loop()
