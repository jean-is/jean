import { Engine, Scene, FreeCamera, HemisphericLight, DirectionalLight, ShadowGenerator, MeshBuilder, StandardMaterial, Color3, Color4, Vector3, ParticleSystem, DynamicTexture, GlowLayer } from 'babylon'
const canvas = document.createElement('canvas')
canvas.style.cssText = 'width:100%;height:100%;display:block'
jean.stage.append(canvas)
const engine = new Engine(canvas, true, { stencil: true })
const scene = new Scene(engine)
scene.clearColor = new Color4(0.08, 0.08, 0.12, 1)
const camera = new FreeCamera('camera', new Vector3(0, 6, -10), scene)
camera.setTarget(Vector3.Zero())
new HemisphericLight('sky', new Vector3(0, 1, 0), scene).intensity = 0.6
const sun = new DirectionalLight('sun', new Vector3(-1, -2, 1), scene)
sun.position = new Vector3(10, 20, -10)
const shadows = new ShadowGenerator(1024, sun)
const paint = (name, r, g, b) => { const m = new StandardMaterial(name, scene); m.diffuseColor = new Color3(r, g, b); return m }
const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene)
ground.receiveShadows = true
ground.material = paint('grass', 0.2, 0.3, 0.25)
const me = MeshBuilder.CreateBox('me', { size: 1 }, scene)
me.position.y = 0.5
me.material = paint('gold', 0.97, 0.77, 0.19)
me.material.emissiveColor = new Color3(0.3, 0.2, 0)
shadows.addShadowCaster(me)
new GlowLayer('glow', scene)
const dot = new DynamicTexture('dot', 32, scene)
const g = dot.getContext()
g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill(); dot.update()
const sparks = new ParticleSystem('sparks', 200, scene)
sparks.particleTexture = dot; sparks.emitter = me; sparks.minSize = 0.1; sparks.maxSize = 0.3; sparks.emitRate = 50; sparks.start()
jean.state('play')
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000
  if (jean.input.down('left')) me.position.x -= 4 * dt
  if (jean.input.down('right')) me.position.x += 4 * dt
  if (jean.input.down('up')) me.position.z += 4 * dt
  if (jean.input.down('down')) me.position.z -= 4 * dt
  me.rotation.y += dt
  scene.render()
})
addEventListener('resize', () => engine.resize())
