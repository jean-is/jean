try { const pads = navigator.getGamepads(); jean.state(`gamepads ${pads.length}`) } catch (e) { jean.state(`gamepads threw ${e.name}`) }
jean.state(`reduced ${jean.reduced}`)
requestAnimationFrame(function f () { requestAnimationFrame(f) })
