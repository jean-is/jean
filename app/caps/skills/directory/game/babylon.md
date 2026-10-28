# Babylon.js in the game's frame

`import { … } from 'babylon'` gives a kit of Babylon.js 9, for games whose fun is depth:
- `Engine`, `Scene`, `Vector3`, `Color3`, `Color4`, `Quaternion`, `Matrix`.
- `MeshBuilder`, `Mesh`, `TransformNode`, `InstancedMesh`; `StandardMaterial`, `DynamicTexture`.
- `FollowCamera`, `ArcRotateCamera`, `FreeCamera`, `UniversalCamera`.
- `HemisphericLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `ShadowGenerator`, `GlowLayer`.
- `ParticleSystem`, `Animation`, `Ray`.

Nothing else is there, and nothing loads: no `SceneLoader`, no `createDefaultEnvironment`, no `GUI`,
no texture from a file or an address. Build every shape with `MeshBuilder`, paint with colours, and
draw any picture on a `DynamicTexture`. There is no physics engine: move things yourself and test
hits with `a.intersectsMesh(b)` or distances. Read controls from `host.input`, never the camera's own
`attachControl`, so keys, touch and gamepads all work.

```js
import { Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight, ShadowGenerator, MeshBuilder, StandardMaterial, Color3, Color4, Vector3 } from 'babylon'

const TUNING = { speed: 6, turn: 2.4 }
const WORDS = { title: 'Harbour Hop', start: 'Space: play', score: 'Buoys' }
const n = new Intl.NumberFormat(host.lang)
const canvas = document.createElement('canvas')
canvas.style.cssText = 'inline-size:100%;block-size:100%;display:block;touch-action:none'
host.stage.append(canvas)
// Words are HTML over the canvas, at the start of the line, clear of the frame's buttons.
const hud = Object.assign(document.createElement('div'), { dir: host.dir })
hud.style.cssText = 'position:absolute;inset-block-start:12px;inset-inline-start:16px;color:#fff;font:600 20px system-ui,sans-serif;pointer-events:none'
host.stage.append(hud)

const engine = new Engine(canvas, true, { stencil: true })
const scene = new Scene(engine)
scene.clearColor = new Color4(0.08, 0.1, 0.16, 1)
new HemisphericLight('sky', new Vector3(0, 1, 0), scene).intensity = 0.7
const sun = new DirectionalLight('sun', new Vector3(-1, -2, 1), scene)
sun.position = new Vector3(20, 40, -20)
const shadows = new ShadowGenerator(1024, sun)
const paint = (name, hex) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex); m.specularColor = Color3.Black(); return m }

const sea = MeshBuilder.CreateGround('sea', { width: 60, height: 60 }, scene)
sea.material = paint('sea', '#1f6f8b'); sea.receiveShadows = true
const boat = MeshBuilder.CreateBox('boat', { width: 1, height: 0.5, depth: 2 }, scene)
boat.position.y = 0.25; boat.material = paint('boat', '#f7c531'); shadows.addShadowCaster(boat)

const camera = new FollowCamera('camera', new Vector3(0, 5, -10), scene, boat)
camera.radius = 10; camera.heightOffset = 4; camera.rotationOffset = 180

const game = { phase: 'title', points: 0 }
hud.textContent = `${WORDS.title} · ${WORDS.start}`
host.state('title')
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000
  if (game.phase === 'title' && host.input.pressed('a')) { game.phase = 'play'; host.state('play') }
  if (game.phase === 'play') {
    boat.rotation.y += ((host.input.down('right') ? 1 : 0) - (host.input.down('left') ? 1 : 0)) * TUNING.turn * dt
    const ahead = (host.input.down('up') ? 1 : 0) - (host.input.down('down') ? 0.5 : 0)
    boat.position.addInPlace(boat.forward.scale(ahead * TUNING.speed * dt))
    hud.textContent = `${WORDS.score} ${n.format(game.points)}`
  }
  scene.render()
})
addEventListener('resize', () => engine.resize())
```

A particle needs a picture: draw a dot on a `DynamicTexture` (`getContext()`, `arc`, `fill`, then
`update()`) and give it as `particleTexture`. Keep scenes light: one shadow generator at 1024, one
glow layer at most, a few hundred meshes, `mesh.createInstance()` for many copies, 200 particles or
fewer. When `host.reduced` is true, keep the camera steady and halve what spins and shakes.
