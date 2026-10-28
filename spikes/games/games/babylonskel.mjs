import { Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight, ShadowGenerator, MeshBuilder, StandardMaterial, Color3, Color4, Vector3 } from 'babylon'

const TUNING = { speed: 6, turn: 2.4 }
const WORDS = { title: 'Harbour Hop', start: 'Space: play' }
const canvas = document.createElement('canvas')
canvas.style.cssText = 'inline-size:100%;block-size:100%;display:block;touch-action:none'
jean.stage.append(canvas)
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

let phase = 'title'
jean.state('title')
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000
  if (phase === 'title' && jean.input.pressed('a')) { phase = 'play'; jean.state('play') }
  if (phase === 'play') {
    boat.rotation.y += ((jean.input.down('right') ? 1 : 0) - (jean.input.down('left') ? 1 : 0)) * TUNING.turn * dt
    const ahead = (jean.input.down('up') ? 1 : 0) - (jean.input.down('down') ? 0.5 : 0)
    boat.position.addInPlace(boat.forward.scale(ahead * TUNING.speed * dt))
  }
  scene.render()
})
addEventListener('resize', () => engine.resize())
