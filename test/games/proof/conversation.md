## Person

Make me a 3D game where I explore a world made of blocks, dig them out and build with them.


### skill

```json
{
 "name": "game"
}
```

# Make a game

Design the game, build it with `game`, play it and fix it before showing it. Decide whatever the request leaves open and keep going: a first version that plays is worth more than a question. A game is never a ```html page.

## Steps

1. Take what the request gives: a theme, a genre, who plays and their age, a picture, a lesson to practise, a length. Fill the rest with these: one player, one screen, one verb, rounds of one to three minutes, played with keys, touch or a gamepad.
2. If the request names an existing game, its characters, levels or art, make an original game of its genre instead, never that game redrawn: turn one of its core rules around (who the player is, what they aim for, or how they move) so that it plays differently, and give it its own name, characters and look, nothing drawn like the original's. Say so in one sentence.
3. Write the design card in the user's language, in your answer and as `game`'s `card`, 120 words at most:
   - Title, and the fantasy in one sentence: "You are… and you must…".
   - The verb: the one action the player repeats, and why repeating it is fun.
   - The loop: thirty seconds of play, how a round ends, how it starts again.
   - The curve: what gets harder and when; the first twenty seconds can't be lost.
   - Controls: the actions used (left, right, up, down, a, b) and what each does.
   - Look and sound: three to five colours, the shapes, three sounds.
   Three pillars at most; what serves none of them is cut.
4. Choose the engine for what makes it fun, and read its sheet beside these steps before writing code:
   - `phaser`: motion in 2D: arcade, platformer, top-down, physics. `game/phaser.md`
   - `babylon`: when depth is the fun, in 3D: sailing, flying, rolling through a world. `game/babylon.md`
   - `none`: turns, rules and stories: board, card, word and logic games, stories with choices. `game/canvas.md`
5. Build the verb first and make it feel good before adding anything (`game/feel.md`): act on key down, buffer input for a few frames, forgive a late jump, give every action a sound and a reaction; halve motion and drop shake when `host.reduced` is true.
6. Then the loop, the curve and the content. Every number goes in one `TUNING` object at the top. One new thing at a time; difficulty up about a tenth per stage, capped, with a breather after each peak.
7. Draw and sound everything from code: shapes, gradients, pixel sprites written as rows of characters, particles; sounds as ZzFX parameter lists through `host.sound()`. Nothing from the internet, and no picture or sound file the user didn't give. What matters stands out by shape as well as colour, at 3:1 contrast or more.
8. Every word the player reads is in the user's language, in one `WORDS` object; numbers through `Intl.NumberFormat`; text 16 pixels or larger on a phone; right to left where `host.dir` is `rtl`.
9. Use what the frame gives instead of rebuilding it: the cover that starts the game, pause, mute, full screen, touch buttons for the actions, `host.save()`. Start play when `a` is pressed, and report moments with `host.state('play' | 'over' | 'won')` and `host.score(n)` so it can be tested.
10. Make it kind to play: an easier mode on the title (slower, more lives), three flashes a second at most, no timer on reading, nothing that only sound tells.
11. Read the report each `game` call returns: it plays the game and says what broke, what each control did and which moments it reached. Fix what it says, with `game_change` for a few passages or `game` again with the game's place for many; after three rounds without a clean report, make the game smaller, not larger.
12. Hand it over in three lines: what it is, how to play, and three ideas to grow it (a new obstacle, a level, a mode) the user can ask for in their own words. Don't end with a question.
13. To change a game later, use `game_change` with the smallest passages; `TUNING` stays the one place for numbers, and the card changes when the design does.

For a child's profile: nothing gory or frightening for their age, no betting or prizes of chance, no daily rewards or streaks, no shop, no timer that punishes; losing is gentle and playing again is one key away. For everyone: no ads, no fake purchases, no links out.

## What the frame gives

The game is one JavaScript module. It runs offline in a frame that already has a cover to start it, pause, mute, full screen and touch buttons. Its global `host`:
- `host.stage`: the element to draw in, the whole frame.
- `host.input.down(action)`, `host.input.pressed(action)` (this frame only), `host.input.on(action, fn)`, for `left`, `right`, `up`, `down`, `a`, `b`, from arrows or WASD, Space, Z or Enter (`a`), X or Shift (`b`), touch buttons and gamepads, which also reach the page as keys.
- `host.sound(...zzfxParams)`: a ZzFX sound, silent when muted.
- `host.save(value)`, `host.load()`: JSON kept between visits, 64 KB at most; `load()` returns it at once. `localStorage` works too.
- `host.state(name)`, `host.score(n)`: the game's moments and score.
- `host.reduced`: true when the player asked for less motion. `host.lang`, `host.dir`: the language and its direction.

Pausing stops the clock for the whole frame: nothing to do for it. The frame's buttons sit in the top corner where lines end, about 160 by 56 pixels, and on a touch screen its pad runs along the bottom: keep words and what matters clear of both.

Files beside these steps: babylon.md, canvas.md, feel.md, phaser.md. Read one with skill({ name: "game/<file>" }).

New tools: game, game_change. You can call them directly from your next step.



### skill

```json
{
 "name": "game/babylon"
}
```

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




### skill

```json
{
 "name": "game/feel"
}
```

# Feel, curve and pace

## Juice: each with its form for `host.reduced`

| Moment | Reaction | With less motion |
|---|---|---|
| Any action | a sound of 0.05–0.15 s, a squash of 10–25% for 80 ms | the sound, a colour flash |
| A hit | 2–4 frames of stop (hit-stop), 6–12 particles, a short shake (0.004–0.008) | the stop and particles, no shake |
| A pickup | rising pitch on a streak, the score pops (scale 1.3 for 120 ms) | the pitch, the score changes colour |
| A loss | a low sound, slow-down to 30% for 0.3 s, then the over screen | the sound, then the screen |
| A win | a bright chord (three quick sounds), confetti | the chord, a still banner |

Never flash the whole screen more than three times a second.

## Controls that forgive

- Act on key down, never on key up.
- Buffer a jump pressed up to 0.1 s before landing; allow it up to 0.1 s after leaving a ledge.
- Hit boxes a little smaller than the drawing for what hurts, a little larger for what helps.
- Show where danger will come from before it comes: a shadow, a blink, a sound.

## The curve

- The first 20 seconds teach the verb and can't be lost.
- Bring in one new thing at a time, alone first, then mixed with what came before.
- Raise speed, number or rate by about a tenth per stage, capped at twice the start.
- After every peak, a breather: fewer threats, a reward.
- The easier mode slows everything by a quarter and gives more lives; it never hides content.

## Pace

A round of one to three minutes; starting again in one key; the best score shown on the title.




### game

```json
{
 "name": "Blockhollow",
 "card": "Blockhollow: you are a small explorer in a world made of blocks, and you must dig out the 12 hidden crystals while you build whatever you like.\nVerb: dig a block (A) and place it back (B). Every block you take is one you can build with.\nLoop: walk around, spot a sparkle on the ground, dig down to the crystal, and build bridges and stairs to get around. Find all 12 to win, then keep building.\nCurve: there's no danger. Crystals lie 3 to 6 blocks deep, and once the nearby ones are found the rest are farther away.\nControls: up/down walk, left/right turn, A dig, B build (with the last kind of block you dug). Walking into a step climbs it.\nLook: sky blue, grass green, earth brown, stone grey, crystal cyan. Sounds: a crunch, a thunk, a chime.",
 "engine": "babylon",
 "actions": [
  "left",
  "right",
  "up",
  "down",
  "a",
  "b"
 ],
 "code": "import { Engine, Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Color4, Vector3, HemisphericLight, UniversalCamera, TransformNode, ParticleSystem, DynamicTexture } from 'babylon'\n\nconst TUNING = {\n  size: 64, height: 28, chunk: 16,\n  walk: 4.4, back: 0.6, turn: 2.6, gravity: 24, jump: 7.8,\n  reach: 3, repeat: 0.22, crystals: 12, trees: 0.014,\n  camDist: 6, camHeight: 3.2, camLerp: 6, glintEvery: 0.3, glintRange: 22,\n  tipTime: 30, saveEvery: 2, maxEdits: 6000\n}\nconst WORDS = {\n  title: 'Blockhollow',\n  tag: 'Dig, build, and find the hidden crystals',\n  play: 'A: play', cont: 'A: continue', fresh: 'B: new world',\n  crystals: 'Crystals',\n  help: 'Up/Down: walk · Left/Right: turn · A: dig · B: build',\n  empty: 'Dig first to get blocks to build with',\n  won: 'You found every crystal!',\n  wonMore: 'Keep building, or start a new world from the title.',\n  names: { 1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Sand', 5: 'Wood', 6: 'Leaves' }\n}\nconst COL = { 1: '#62b74a', 2: '#8a5a33', 3: '#8d939c', 4: '#e6d18a', 5: '#7b5032', 6: '#3d8c3f', 7: '#3fe6ff', 8: '#3b3a46' }\nconst DIG_PITCH = { 1: 180, 2: 150, 3: 320, 4: 230, 5: 200, 6: 420 }\nconst fmt = new Intl.NumberFormat(host.lang)\nconst W = TUNING.size, H = TUNING.height, C = TUNING.chunk\n\n// ---------- page ----------\nconst canvas = document.createElement('canvas')\ncanvas.style.cssText = 'inline-size:100%;block-size:100%;display:block;touch-action:none'\nhost.stage.append(canvas)\nconst shadowTxt = 'text-shadow:0 1px 3px #000,0 0 2px #000'\nconst hud = Object.assign(document.createElement('div'), { dir: host.dir })\nhud.style.cssText = `position:absolute;inset-block-start:12px;inset-inline-start:16px;max-inline-size:calc(100% - 200px);color:#fff;font:600 20px system-ui,sans-serif;pointer-events:none;${shadowTxt};display:none`\nhost.stage.append(hud)\nconst line1 = document.createElement('div'); hud.append(line1)\nconst chipRow = document.createElement('div'); chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-block-start:8px'; hud.append(chipRow)\nconst tip = document.createElement('div'); tip.style.cssText = 'margin-block-start:8px;font-size:17px;font-weight:500'; hud.append(tip)\nconst chips = {}\nfor (const t of [1, 2, 3, 4, 5, 6]) {\n  const c = document.createElement('div')\n  c.title = WORDS.names[t]\n  c.style.cssText = 'display:flex;align-items:center;gap:5px;padding:3px 7px;border-radius:8px;background:rgba(0,0,0,.45);font-size:17px;border:2px solid transparent'\n  const sw = document.createElement('span'); sw.style.cssText = `inline-size:16px;block-size:16px;background:${COL[t]};border:1px solid #000;display:inline-block`\n  const num = document.createElement('span')\n  c.append(sw, num); chipRow.append(c); chips[t] = { c, num }\n}\nconst center = Object.assign(document.createElement('div'), { dir: host.dir })\ncenter.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;color:#fff;font:600 20px system-ui,sans-serif;pointer-events:none;${shadowTxt};padding:16px`\nhost.stage.append(center)\n\n// ---------- scene ----------\nconst engine = new Engine(canvas, true, { stencil: true })\nconst scene = new Scene(engine)\nconst SKY = Color3.FromHexString('#9fd4f0')\nscene.clearColor = new Color4(SKY.r, SKY.g, SKY.b, 1)\nscene.fogMode = Scene.FOGMODE_EXP2\nscene.fogDensity = 0.016\nscene.fogColor = SKY\nconst light = new HemisphericLight('sky', new Vector3(0.3, 1, 0.2), scene)\nlight.intensity = 1\nlight.groundColor = new Color3(0.78, 0.78, 0.84)\nlight.specular = Color3.Black()\nconst blockMat = new StandardMaterial('blocks', scene)\nblockMat.diffuseColor = Color3.White(); blockMat.specularColor = Color3.Black(); blockMat.backFaceCulling = false\nconst paint = (name, hex, alpha = 1, glow = false) => {\n  const m = new StandardMaterial(name, scene)\n  m.diffuseColor = Color3.FromHexString(hex); m.specularColor = Color3.Black(); m.alpha = alpha\n  if (glow) m.emissiveColor = Color3.FromHexString(hex)\n  return m\n}\n\n// ---------- world ----------\nconst vox = new Uint8Array(W * W * H)\nconst id = (x, y, z) => x + z * W + y * W * W\nconst get = (x, y, z) => (x >= 0 && x < W && z >= 0 && z < W && y >= 0 && y < H) ? vox[id(x, y, z)] : 0\nconst solid = (x, y, z) => (x < 0 || x >= W || z < 0 || z >= W || y < 0) ? 1 : (y >= H ? 0 : vox[id(x, y, z)])\nconst rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }\nfunction hash (x, z, k) { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(k | 0, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }\nfunction noise (x, z, k) {\n  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz\n  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)\n  const a = hash(ix, iz, k), b = hash(ix + 1, iz, k), c = hash(ix, iz + 1, k), d = hash(ix + 1, iz + 1, k)\n  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz\n}\nlet crystals = []\nfunction generate (s) {\n  vox.fill(0)\n  const r = rng(s), hs = new Int16Array(W * W)\n  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {\n    const n = noise(x / 22, z / 22, s) * 0.6 + noise(x / 10, z / 10, s + 1) * 0.3 + noise(x / 5, z / 5, s + 2) * 0.1\n    const h = Math.max(4, Math.min(H - 9, Math.floor(2 + n * 18)))\n    hs[x + z * W] = h\n    for (let y = 0; y <= h; y++) {\n      let t = y === 0 ? 8 : y < h - 3 ? 3 : y < h ? 2 : 1\n      if (h <= 8 && y >= h - 2 && y > 0) t = 4\n      vox[id(x, y, z)] = t\n    }\n  }\n  const trees = []\n  for (let x = 3; x < W - 3; x++) for (let z = 3; z < W - 3; z++) {\n    const h = hs[x + z * W]\n    if (vox[id(x, h, z)] !== 1 || r() > TUNING.trees) continue\n    if (Math.abs(x - W / 2) < 3 && Math.abs(z - W / 2) < 3) continue\n    if (!trees.every(t => Math.abs(t[0] - x) > 3 || Math.abs(t[1] - z) > 3)) continue\n    trees.push([x, z])\n    const th = 3 + Math.floor(r() * 2), top = h + th\n    for (let i = 1; i <= th; i++) vox[id(x, h + i, z)] = 5\n    for (let dy = -1; dy <= 2; dy++) {\n      const rad = dy >= 1 ? 1 : 2\n      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {\n        if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue\n        const y = top + dy\n        if (y < H && get(x + dx, y, z + dz) === 0) vox[id(x + dx, y, z + dz)] = 6\n      }\n    }\n  }\n  const list = []\n  for (let tries = 0; tries < 2000 && list.length < TUNING.crystals; tries++) {\n    const x = 2 + Math.floor(r() * (W - 4)), z = 2 + Math.floor(r() * (W - 4))\n    const y = hs[x + z * W] - 3 - Math.floor(r() * 4)\n    if (y < 1 || vox[id(x, y, z)] !== 3) continue\n    if (!list.every(c => Math.hypot(c.x - x, c.z - z) > 7)) continue\n    vox[id(x, y, z)] = 7\n    list.push({ x, y, z })\n  }\n  return list\n}\n\n// ---------- meshing ----------\nconst RGB = {}\nfor (const k in COL) { const c = Color3.FromHexString(COL[k]); RGB[k] = [c.r, c.g, c.b] }\nconst FACES = [[0, 1, 1, 2, 0.82], [0, -1, 1, 2, 0.82], [1, 1, 0, 2, 1], [1, -1, 0, 2, 0.55], [2, 1, 0, 1, 0.7], [2, -1, 0, 1, 0.7]]\nconst CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]]\nconst AO = [0.5, 0.68, 0.84, 1]\nconst meshes = new Map()\nfunction buildChunk (cx, cz) {\n  if (cx < 0 || cz < 0 || cx >= W / C || cz >= W / C) return\n  const key = cx + ',' + cz\n  const old = meshes.get(key)\n  if (old) { old.dispose(); meshes.delete(key) }\n  const pos = [], nrm = [], col = [], idx = []\n  const L = [0, 0, 0], q = [0, 0, 0], P = [0, 0, 0]\n  for (let x = cx * C; x < cx * C + C; x++) for (let z = cz * C; z < cz * C + C; z++) for (let y = 0; y < H; y++) {\n    const t = vox[id(x, y, z)]\n    if (!t) continue\n    const vary = 0.9 + 0.1 * hash(x * 7 + y, z * 3 - y, 99)\n    for (const [a, s, u, v, shade] of FACES) {\n      L[0] = x; L[1] = y; L[2] = z; L[a] += s\n      if (get(L[0], L[1], L[2])) continue\n      const base = RGB[(t === 1 && !(a === 1 && s === 1)) ? 2 : t]\n      const start = pos.length / 3\n      for (const [cu, cv] of CORNERS) {\n        P[0] = x; P[1] = y; P[2] = z\n        if (s > 0) P[a] += 1\n        P[u] += cu; P[v] += cv\n        const du = cu ? 1 : -1, dv = cv ? 1 : -1\n        q[0] = L[0]; q[1] = L[1]; q[2] = L[2]; q[u] += du\n        const s1 = get(q[0], q[1], q[2]) ? 1 : 0\n        q[0] = L[0]; q[1] = L[1]; q[2] = L[2]; q[v] += dv\n        const s2 = get(q[0], q[1], q[2]) ? 1 : 0\n        q[u] += du\n        const c3 = get(q[0], q[1], q[2]) ? 1 : 0\n        const ao = (s1 && s2) ? 0 : 3 - s1 - s2 - c3\n        const k = shade * AO[ao] * vary\n        pos.push(P[0], P[1], P[2])\n        nrm.push(a === 0 ? s : 0, a === 1 ? s : 0, a === 2 ? s : 0)\n        col.push(base[0] * k, base[1] * k, base[2] * k, 1)\n      }\n      idx.push(start, start + 1, start + 2, start, start + 2, start + 3)\n    }\n  }\n  if (!idx.length) return\n  const m = new Mesh('chunk' + key, scene)\n  m.setVerticesData('position', pos)\n  m.setVerticesData('normal', nrm)\n  m.setVerticesData('color', col)\n  m.setIndices(idx)\n  m.material = blockMat\n  m.isPickable = false\n  meshes.set(key, m)\n}\nfunction buildAll () {\n  for (const m of meshes.values()) m.dispose()\n  meshes.clear()\n  for (let cx = 0; cx < W / C; cx++) for (let cz = 0; cz < W / C; cz++) buildChunk(cx, cz)\n}\nconst edits = new Map()\nlet dirty = false\nfunction setBlock (x, y, z, t) {\n  const i = id(x, y, z)\n  vox[i] = t; edits.set(i, t); dirty = true\n  const cx = Math.floor(x / C), cz = Math.floor(z / C), lx = x - cx * C, lz = z - cz * C\n  const xs = [cx], zs = [cz]\n  if (lx === 0) xs.push(cx - 1); if (lx === C - 1) xs.push(cx + 1)\n  if (lz === 0) zs.push(cz - 1); if (lz === C - 1) zs.push(cz + 1)\n  for (const a of xs) for (const b of zs) buildChunk(a, b)\n}\n\n// ---------- particles ----------\nconst dot = new DynamicTexture('dot', 32, scene, false)\n{ const g = dot.getContext(); g.clearRect(0, 0, 32, 32); g.fillStyle = '#fff'; g.fillRect(5, 5, 22, 22); dot.update(); dot.hasAlpha = true }\nconst burst = new ParticleSystem('burst', 150, scene)\nburst.particleTexture = dot\nburst.emitter = new Vector3(0, -50, 0)\nburst.minEmitBox = new Vector3(-0.4, -0.4, -0.4); burst.maxEmitBox = new Vector3(0.4, 0.4, 0.4)\nburst.direction1 = new Vector3(-2, 3, -2); burst.direction2 = new Vector3(2, 5, 2)\nburst.gravity = new Vector3(0, -14, 0)\nburst.minSize = 0.1; burst.maxSize = 0.22; burst.minLifeTime = 0.3; burst.maxLifeTime = 0.6\nburst.minEmitPower = 1; burst.maxEmitPower = 2; burst.emitRate = 0\nburst.blendMode = ParticleSystem.BLENDMODE_STANDARD\nburst.start()\nconst glint = new ParticleSystem('glint', 60, scene)\nglint.particleTexture = dot\nglint.emitter = new Vector3(0, -50, 0)\nglint.minEmitBox = new Vector3(-0.35, 0, -0.35); glint.maxEmitBox = new Vector3(0.35, 0.2, 0.35)\nglint.direction1 = new Vector3(-0.2, 0.6, -0.2); glint.direction2 = new Vector3(0.2, 1.1, 0.2)\nglint.color1 = new Color4(0.5, 1, 1, 1); glint.color2 = new Color4(0.25, 0.9, 1, 1); glint.colorDead = new Color4(0, 0.3, 0.4, 0)\nglint.minSize = 0.12; glint.maxSize = 0.26; glint.minLifeTime = 0.9; glint.maxLifeTime = 1.5\nglint.minEmitPower = 0.5; glint.maxEmitPower = 1; glint.emitRate = 0\nglint.start()\nfunction puff (x, y, z, hex, count = 12) {\n  const c = Color3.FromHexString(hex)\n  burst.emitter = new Vector3(x + 0.5, y + 0.5, z + 0.5)\n  burst.color1 = new Color4(c.r, c.g, c.b, 1); burst.color2 = new Color4(c.r * 0.8, c.g * 0.8, c.b * 0.8, 1)\n  burst.colorDead = new Color4(c.r, c.g, c.b, 0)\n  burst.manualEmitCount = count\n}\n\n// ---------- player ----------\nconst player = new TransformNode('player', scene)\nconst part = (name, w, h, d, y, z, hex) => {\n  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene)\n  m.position.set(0, y, z); m.material = paint(name, hex); m.parent = player; m.isPickable = false\n  return m\n}\npart('legs', 0.5, 0.6, 0.34, 0.3, 0, '#2f3f66')\npart('body', 0.6, 0.65, 0.4, 0.92, 0, '#e8743b')\npart('head', 0.5, 0.48, 0.48, 1.48, 0, '#f2c79b')\npart('eyes', 0.34, 0.1, 0.05, 1.53, 0.25, '#1d1d1d')\npart('cap', 0.54, 0.12, 0.54, 1.76, 0.03, '#d63c3c')\nconst blob = MeshBuilder.CreateDisc('blob', { radius: 0.36, tessellation: 20 }, scene)\nblob.rotation.x = Math.PI / 2; blob.material = paint('blob', '#000000', 0.3); blob.isPickable = false\nconst digBox = MeshBuilder.CreateBox('dig', { size: 1.04 }, scene)\nconst digMat = paint('digMat', '#ffffff', 0.28, true); digMat.diffuseColor = Color3.Black(); digBox.material = digMat; digBox.isPickable = false\nconst buildBox = MeshBuilder.CreateBox('build', { size: 0.9 }, scene)\nconst buildMat = paint('buildMat', '#ffffff', 0.45, true); buildBox.material = buildMat; buildBox.isPickable = false\n\nconst cam = new UniversalCamera('cam', new Vector3(W / 2, 30, -10), scene)\ncam.minZ = 0.1; cam.fov = 0.95\ncam.inputs.clear()\n\n// ---------- state ----------\nconst p = { x: W / 2 + 0.5, y: 20, z: W / 2 + 0.5 }\nlet yaw = 0, vy = 0, grounded = false, squash = 0\nlet inv = [0, 0, 0, 0, 0, 0, 0, 0, 0], sel = 0, found = 0, total = TUNING.crystals, won = false, seed = 1\nconst game = { phase: 'title', t: 0, aT: 0, bT: 0, glintT: 0, glintI: 0, saveT: 0, msgT: 0, bannerT: 0, orbit: 0 }\n\nfunction spawn () {\n  p.x = W / 2 + 0.5; p.z = W / 2 + 0.5\n  let y = H - 1\n  while (y > 0 && !solid(Math.floor(p.x), y, Math.floor(p.z))) y--\n  p.y = y + 1; vy = 0; yaw = 0\n}\nfunction newWorld () {\n  seed = (Math.random() * 1e9) | 0\n  crystals = generate(seed); total = crystals.length\n  edits.clear(); inv = [0, 0, 0, 0, 0, 0, 0, 0, 0]; sel = 0; found = 0; won = false\n  buildAll(); spawn(); persist()\n}\nfunction persist () {\n  const arr = []\n  let n = 0\n  for (const [k, t] of edits) { if (n++ >= TUNING.maxEdits) break; arr.push(k, t) }\n  host.save({ v: 1, seed, edits: arr, inv, found, total, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +yaw.toFixed(2)] })\n  dirty = false\n}\nconst saved = host.load()\nlet hasSave = false\nif (saved && saved.v === 1 && typeof saved.seed === 'number') {\n  hasSave = true\n  seed = saved.seed\n  crystals = generate(seed); total = crystals.length\n  const e = saved.edits || []\n  for (let i = 0; i + 1 < e.length; i += 2) { vox[e[i]] = e[i + 1]; edits.set(e[i], e[i + 1]) }\n  crystals = crystals.filter(c => vox[id(c.x, c.y, c.z)] === 7)\n  inv = Array.isArray(saved.inv) ? saved.inv : inv\n  found = saved.found || 0\n  won = found >= total\n  buildAll()\n  if (Array.isArray(saved.p)) { [p.x, p.y, p.z, yaw] = saved.p } else spawn()\n} else {\n  seed = (Math.random() * 1e9) | 0\n  crystals = generate(seed); total = crystals.length\n  buildAll(); spawn()\n}\n\n// ---------- helpers ----------\nfunction hits (px, py, pz) {\n  const r = 0.3\n  for (let x = Math.floor(px - r); x <= Math.floor(px + r - 1e-4); x++)\n    for (let z = Math.floor(pz - r); z <= Math.floor(pz + r - 1e-4); z++)\n      for (let y = Math.floor(py); y <= Math.floor(py + 1.7 - 1e-4); y++)\n        if (solid(x, y, z)) return true\n  return false\n}\nfunction overlapsPlayer (x, y, z) {\n  return x + 1 > p.x - 0.3 && x < p.x + 0.3 && z + 1 > p.z - 0.3 && z < p.z + 0.3 && y + 1 > p.y && y < p.y + 1.7\n}\nfunction rayCells () {\n  const dx = Math.sin(yaw), dz = Math.cos(yaw)\n  let cx = Math.floor(p.x), cz = Math.floor(p.z)\n  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1\n  const tdx = Math.abs(1 / dx), tdz = Math.abs(1 / dz)\n  let tmx = dx !== 0 ? (sx > 0 ? cx + 1 - p.x : p.x - cx) * tdx : Infinity\n  let tmz = dz !== 0 ? (sz > 0 ? cz + 1 - p.z : p.z - cz) * tdz : Infinity\n  const out = []\n  while (out.length < 4) {\n    let t\n    if (tmx < tmz) { cx += sx; t = tmx; tmx += tdx } else { cz += sz; t = tmz; tmz += tdz }\n    if (t > TUNING.reach) break\n    out.push([cx, cz])\n  }\n  return out\n}\nfunction digTarget (cells) {\n  const fy = Math.floor(p.y + 0.01)\n  for (const [x, z] of cells) for (const y of [fy + 1, fy]) {\n    const t = get(x, y, z)\n    if (t && t !== 8) return { x, y, z, t }\n  }\n  if (cells[0]) {\n    const [x, z] = cells[0], y = fy - 1, t = get(x, y, z)\n    if (t && t !== 8) return { x, y, z, t }\n  }\n  return null\n}\nfunction buildTarget (cells) {\n  const fy = Math.floor(p.y + 0.01)\n  for (const [x, z] of cells.slice(0, 2)) {\n    if (x < 0 || z < 0 || x >= W || z >= W) return null\n    for (const y of [fy - 1, fy, fy + 1, fy + 2]) {\n      if (y < 1 || y >= H) continue\n      if (get(x, y, z) !== 0) continue\n      if (overlapsPlayer(x, y, z)) break\n      return { x, y, z }\n    }\n  }\n  return null\n}\nfunction pickSel () {\n  if (sel && inv[sel] > 0) return sel\n  for (let t = 1; t <= 6; t++) if (inv[t] > 0) return t\n  return 0\n}\nfunction drawHud () {\n  line1.textContent = `◆ ${WORDS.crystals} ${fmt.format(found)} / ${fmt.format(total)}`\n  const s = pickSel()\n  for (let t = 1; t <= 6; t++) {\n    chips[t].num.textContent = fmt.format(inv[t])\n    chips[t].c.style.opacity = inv[t] > 0 ? '1' : '0.45'\n    chips[t].c.style.borderColor = t === s ? '#ffe14d' : 'transparent'\n  }\n  if (game.msgT > 0) tip.textContent = WORDS.empty\n  else tip.textContent = game.t < TUNING.tipTime ? WORDS.help : ''\n}\nfunction chord () {\n  host.sound(0.8, 0, 523, 0, 0.1, 0.3, 0)\n  setTimeout(() => host.sound(0.8, 0, 659, 0, 0.1, 0.3, 0), 120)\n  setTimeout(() => host.sound(0.8, 0, 784, 0, 0.15, 0.5, 0), 240)\n}\n\n// ---------- actions ----------\nfunction dig () {\n  const t = digTarget(rayCells())\n  if (!t) { host.sound(0.3, 0, 110, 0, 0.02, 0.05, 2); return }\n  setBlock(t.x, t.y, t.z, 0)\n  if (!host.reduced) squash = 1\n  if (t.t === 7) {\n    found++\n    crystals = crystals.filter(c => !(c.x === t.x && c.y === t.y && c.z === t.z))\n    puff(t.x, t.y, t.z, COL[7], 30)\n    host.sound(1, 0, 660 + found * 40, 0, 0.1, 0.35, 0, 1.5, 0, 0, 330, 0.06)\n    host.score(found)\n    if (!won && found >= total) {\n      won = true; game.bannerT = 6; chord(); host.state('won')\n    }\n  } else {\n    inv[t.t]++; sel = t.t\n    puff(t.x, t.y, t.z, COL[t.t])\n    host.sound(0.9, 0.05, DIG_PITCH[t.t] || 200, 0, 0.01, 0.09, 4, 1, 0, 0, 0, 0, 0, 1.5)\n  }\n  drawHud()\n}\nfunction build () {\n  const s = pickSel()\n  if (!s) { game.msgT = 2.5; host.sound(0.3, 0, 110, 0, 0.02, 0.05, 2); drawHud(); return }\n  const t = buildTarget(rayCells())\n  if (!t) { host.sound(0.3, 0, 110, 0, 0.02, 0.05, 2); return }\n  setBlock(t.x, t.y, t.z, s)\n  inv[s]--\n  if (!host.reduced) squash = 0.7\n  puff(t.x, t.y, t.z, COL[s], 6)\n  host.sound(0.7, 0.05, 260, 0, 0.02, 0.07, 1, 2)\n  drawHud()\n}\n\n// ---------- phases ----------\nfunction showTitle () {\n  center.style.background = 'rgba(10,20,40,.35)'\n  center.innerHTML = ''\n  const h = document.createElement('div'); h.textContent = WORDS.title; h.style.cssText = 'font-size:44px;font-weight:800'\n  const tg = document.createElement('div'); tg.textContent = WORDS.tag\n  const a = document.createElement('div'); a.textContent = hasSave ? WORDS.cont : WORDS.play; a.style.cssText = 'margin-block-start:12px;font-size:24px;color:#ffe14d'\n  center.append(h, tg, a)\n  if (hasSave) {\n    const b = document.createElement('div'); b.textContent = WORDS.fresh; center.append(b)\n    const f = document.createElement('div'); f.textContent = `◆ ${fmt.format(found)} / ${fmt.format(total)}`; center.append(f)\n  }\n}\nfunction startPlay () {\n  game.phase = 'play'; game.t = 0\n  center.innerHTML = ''; center.style.background = 'none'\n  hud.style.display = 'block'\n  drawHud()\n  host.state('play')\n  host.sound(0.6, 0, 440, 0, 0.05, 0.15, 0, 1, 0, 0, 220, 0.05)\n}\nshowTitle()\nhost.state('title')\n\nfunction update (dt) {\n  game.t += dt\n  const I = host.input\n  yaw += ((I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0)) * TUNING.turn * dt\n  const fwd = (I.down('up') ? 1 : 0) - (I.down('down') ? TUNING.back : 0)\n  const dx = Math.sin(yaw) * fwd * TUNING.walk * dt, dz = Math.cos(yaw) * fwd * TUNING.walk * dt\n  let blocked = false\n  if (dx) { if (!hits(p.x + dx, p.y, p.z)) p.x += dx; else blocked = true }\n  if (dz) { if (!hits(p.x, p.y, p.z + dz)) p.z += dz; else blocked = true }\n  if (blocked && grounded && fwd !== 0 && !hits(p.x + dx * 3, p.y + 1.05, p.z + dz * 3)) {\n    vy = TUNING.jump; host.sound(0.25, 0, 300, 0, 0.02, 0.05, 0, 1, 8)\n  }\n  vy = Math.max(vy - TUNING.gravity * dt, -20)\n  const ny = p.y + vy * dt\n  if (hits(p.x, ny, p.z)) {\n    if (vy < 0) { p.y = Math.floor(ny) + 1; grounded = true } else p.y = Math.floor(ny + 1.7) - 1.7 - 0.001\n    vy = 0\n  } else { p.y = ny; grounded = false }\n\n  if (I.pressed('a')) { dig(); game.aT = TUNING.repeat } else if (I.down('a')) { game.aT -= dt; if (game.aT <= 0) { dig(); game.aT = TUNING.repeat } }\n  if (I.pressed('b')) { build(); game.bT = TUNING.repeat } else if (I.down('b')) { game.bT -= dt; if (game.bT <= 0) { build(); game.bT = TUNING.repeat } }\n\n  // targets\n  const cells = rayCells()\n  const dt0 = digTarget(cells)\n  digBox.isVisible = !!dt0\n  if (dt0) digBox.position.set(dt0.x + 0.5, dt0.y + 0.5, dt0.z + 0.5)\n  const s = pickSel()\n  const bt = s ? buildTarget(cells) : null\n  buildBox.isVisible = !!bt\n  if (bt) { buildBox.position.set(bt.x + 0.5, bt.y + 0.5, bt.z + 0.5); const c = Color3.FromHexString(COL[s]); buildMat.diffuseColor = c; buildMat.emissiveColor = c.scale(0.5) }\n\n  // player look\n  player.position.set(p.x, p.y, p.z)\n  player.rotation.y = yaw\n  squash = Math.max(0, squash - dt * 8)\n  player.scaling.y = 1 - 0.15 * squash; player.scaling.x = player.scaling.z = 1 + 0.08 * squash\n  let gy = Math.floor(p.y + 0.01)\n  while (gy > 0 && !solid(Math.floor(p.x), gy - 1, Math.floor(p.z))) gy--\n  blob.position.set(p.x, gy + 0.02, p.z)\n\n  // camera: behind and above, pulled in when a wall is in the way\n  const head = new Vector3(p.x, p.y + 1.4, p.z)\n  const back = new Vector3(-Math.sin(yaw) * TUNING.camDist, TUNING.camHeight, -Math.cos(yaw) * TUNING.camDist)\n  let f = 1\n  for (let k = 0.1; k <= 1; k += 0.05) {\n    const q = head.add(back.scale(k))\n    if (solid(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z))) { f = Math.max(0.15, k - 0.1); break }\n  }\n  const want = head.add(back.scale(f))\n  const l = Math.min(1, dt * TUNING.camLerp)\n  cam.position = Vector3.Lerp(cam.position, want, f < 1 ? 1 : l)\n  cam.setTarget(head)\n\n  // crystal sparkles\n  game.glintT -= dt\n  if (game.glintT <= 0 && crystals.length) {\n    game.glintT = TUNING.glintEvery\n    const near = crystals.filter(c => Math.hypot(c.x + 0.5 - p.x, c.z + 0.5 - p.z) < TUNING.glintRange)\n    if (near.length) {\n      const c = near[game.glintI++ % near.length]\n      let top = H - 1\n      while (top > 0 && !get(c.x, top, c.z)) top--\n      glint.emitter = new Vector3(c.x + 0.5, top + 1.05, c.z + 0.5)\n      glint.manualEmitCount = 3\n    }\n  }\n\n  // words\n  if (game.msgT > 0) { game.msgT -= dt; if (game.msgT <= 0) drawHud() }\n  if (game.t > TUNING.tipTime && game.t - dt <= TUNING.tipTime) drawHud()\n  if (game.bannerT > 0) {\n    if (center.childElementCount === 0) {\n      const a = document.createElement('div'); a.textContent = WORDS.won; a.style.cssText = 'font-size:34px;font-weight:800;color:#7ff3ff'\n      const b = document.createElement('div'); b.textContent = WORDS.wonMore\n      center.append(a, b)\n    }\n    game.bannerT -= dt\n    if (game.bannerT <= 0) center.innerHTML = ''\n  }\n\n  // keep the world\n  game.saveT -= dt\n  if (game.saveT <= 0) { game.saveT = TUNING.saveEvery; if (dirty || game.t < 1) persist() }\n}\n\nengine.runRenderLoop(() => {\n  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05)\n  if (game.phase === 'title') {\n    if (!host.reduced) game.orbit += dt * 0.12\n    const r = 42\n    cam.position.set(W / 2 + Math.cos(game.orbit) * r, 28, W / 2 + Math.sin(game.orbit) * r)\n    cam.setTarget(new Vector3(W / 2, 10, W / 2))\n    if (host.input.pressed('a')) startPlay()\n    else if (hasSave && host.input.pressed('b')) { newWorld(); hasSave = false; startPlay() }\n  } else update(dt)\n  scene.render()\n})\naddEventListener('resize', () => engine.resize())\naddEventListener('pagehide', () => { if (game.phase === 'play') persist() })\n"
}
```

Made Blockhollow, at games/01M618J3XDP6TSKBY6YYF5PAE7-blockhollow.game.html. Its play-test:
Moments: title → play.
left, right, up, down, a, b changed the picture.
Words seen: ◆ Crystals 0 / 12 1 0 0 0 0 0 Up/Down: walk · Left/Right: turn · A: dig · B: bui.
Work per frame: 0.2 ms on average, 14 ms at worst; a frame is 16.7 ms.
Not reached while testing: over or won, fine if the tester just survived.
Nothing to fix.

I made **Blockhollow**, a 3D game set in a world made of blocks. It ran through an automatic test with every control working and nothing to fix, though the test never got as far as finding all the crystals.

**How to play:** Up/Down walk and Left/Right turn. **A** digs the block in front of you and keeps it. **B** places a block, using the last kind you dug. A white glow shows which block you'll dig and a coloured see-through block shows where yours will land. Walking into a one-block step climbs it automatically. It's a sandbox, so you can build whatever you like. There's also a goal: 12 crystals are hidden a few blocks underground, and sparkles on the grass show roughly where to dig. Your world and progress are saved, and from the title screen you can carry on or start a new world with **B**.

To keep it simple, there's no way to choose which kind of block to place yet. It's always the last kind you dug, or another one you have if that runs out.

**Ideas to grow it:**
- Let me pick which kind of block to build with
- Add caves and water to explore
- Add a day and night cycle with glowing torches you can place

<suggestions>
Let me pick which block to build with
Add caves and water to explore
Add day and night with torches
</suggestions>