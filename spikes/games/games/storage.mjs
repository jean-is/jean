const best = Number(localStorage.getItem('best') ?? 0)
localStorage.setItem('best', String(best + 1))
const before = await jean.load()
jean.save({ runs: (before?.runs ?? 0) + 1 })
jean.state(`play best=${best + 1} runs=${(before?.runs ?? 0) + 1}`)
const font = document.createElement('link')
font.rel = 'stylesheet'; font.href = 'https://fonts.googleapis.com/css2?family=Inter'
document.head.append(font)
alert('hello')
try { await fetch('data:text/plain,hi') } catch (e) { jean.state(`fetch data: ${e.name}`) }
requestAnimationFrame(function f () { requestAnimationFrame(f) })
