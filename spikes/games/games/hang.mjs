jean.state('play')
let n = 0
requestAnimationFrame(function f () { if (++n === 20) while (true) {} requestAnimationFrame(f) })
