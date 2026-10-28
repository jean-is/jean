let n = 0
const loop = () => {
  n++
  if (n === 30) null.player.x = 1
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
