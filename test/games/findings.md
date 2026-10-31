# Games, phase 0: findings (28 Oct 2026)

A spike outside Jean was run with headless Playwright, Chromium and WebKit. It used:
- Jean's own `preview.html` relay;
- the page policy in folder mode (`connect-src 'none'`, no `'unsafe-eval'`);
- `sandbox="allow-scripts allow-forms"`;
- engines lent through `data:` stand-ins, as ECharts is.

Its code is the prototype of `caps/games/` (shell, guard, play-test, report), about 370 counted lines.

## Gates

| # | Gate | Chromium | WebKit | Verdict |
|---|---|---|---|---|
| 1 | Engines boot under the policy, no violation, no `eval` | Phaser 4.2.1, Phaser 3.90, Babylon.js 9.32.1 kit, ZzFX: clean | same | pass. Phaser's one `new Function` is webpack's dead `globalThis` fallback |
| 2 | Packaging | Phaser ships `phaser.esm.min.js`; Babylon.js and ZzFX bundled by esbuild into one ESM file each | — | pass |
| 3 | Virtual frames run fast, in a clipped host | Phaser ≈ 1 ms a frame; Babylon.js 12–14 ms (software WebGL in headless Chromium) | Phaser 0.3 ms, Babylon.js 1.5 ms | pass for 2D; 3D is slow in headless Chromium only |
| 3b | In a background tab | headless pages never become hidden: not measurable here | same | unverified, to check by hand |
| 4 | WebGL read back for fingerprints | in the task that drew it, no `preserveDrawingBuffer` | same | pass |
| 5 | Error lines | runtime: exact (line 4, col 22, frame 29); syntax: on a `<script type=module>` element's error event | runtime exact; syntax: only on `import()`'s error (`e.line`) | pass, doing both |
| 6 | `localStorage` stand-in, saves, gamepad | stand-in and `save`/`load` survive a reload; `getGamepads()` doesn't throw, with or without `allow` | same | pass (a real gamepad untested) |
| 7 | A loop that never ends | freezes Jean's page in Playwright's Chromium, not in real Chrome (sandboxed frames get a process of their own) | freezes Jean's page | fixed by the loop guard (below) |
| 8 | Brains | see below | | |

Determinism: with seeded `Math.random`, virtual `performance.now`/`Date`/timers/`requestAnimationFrame`, two runs give identical pictures. This held for Phaser, the Babylon.js kit, canvas and HTML, in both browsers, with two exceptions:
- LittleJS 1.28 wasn't deterministic, and ignored synthetic keys, in WebKit. It is out, even as a fallback.
- In WebKit, one Babylon.js run in four showed a change with nothing pressed. The play-test therefore runs its baseline twice, and counts only changes beyond the two baselines' own difference.

## Engines

| Engine | Use | Raw | gzip | Licence |
|---|---|---|---|---|
| Phaser 4.2.1 (`phaser.esm.min.js`) | 2D | 1.38 MB | 353 KB | MIT |
| Babylon.js 9.32.1, the curated kit | 3D | 2.18 MB | 501 KB | Apache-2.0 |
| Babylon.js 9.32.1, the whole core | — | 8.32 MB | 1.86 MB | Apache-2.0 |
| ZzFX 1.4.0 | sounds | 2 KB | 1 KB | MIT |

**The kit** holds what a game uses:
- engine and scene;
- maths;
- `MeshBuilder`, meshes and instances;
- standard material, `Texture`, `DynamicTexture`;
- free, universal, follow and arc-rotate cameras;
- four lights;
- shadows, glow and particles;
- animation, rays;
- collisions;
- edges and outlines, with their side-effect components.

A class outside the kit fails with "does not provide an export named …", at the import's line.

**What the kit leaves out:** loaders and Babylon's CDN. `createDefaultEnvironment` and `SceneLoader` reach `assets.babylonjs.com`, which the policy blocks.

**Phaser 4 for brains that learned Phaser 3:** the sheet's v3-style skeleton and a v3-style test game run unchanged on 4. The breaks that matter for small games:
- `setTintFill`;
- `Math.TAU`, now 2π, and `PI2`;
- `Geom.Point`;
- `preFX`/`postFX`;
- `textures.generate()`.

Phaser ships 28 skills of its own in `node_modules/phaser/skills/` (a migration guide among them), a source to trim the sheets from.

`this.load.*` can't work: `fetch('data:…')` is refused by `connect-src 'none'`. Textures come from Graphics and `generateTexture`, and sounds from ZzFX.

## The loop guard

A tokenizer of about 90 lines skips strings, templates (nested `${}` included), comments and regular expressions. It puts `__loop() && (…)` into every `while`, `do…while` and classic `for` condition, and leaves `for…of`/`for…in` alone. It adds no line, so error lines stay true.

`__loop()` throws once a loop has run a second without the frame's task ending. The check is re-armed for each task through a `MessageChannel`, so a game whose frames end normally is never stopped.

Results:
- Six unit tests pass.
- The hang game reports "A loop ran for a second without ending" at line 3, frame 19, in both browsers, and Jean's page answers in 1 ms.
- A guarded skeleton still has nothing to fix.


## The play-test

**How it runs:**
1. The shell owns the clock and steps 420 virtual frames through a `MessageChannel`.
2. It presses `a` at frame 20, to leave a title.
3. It holds each action in a run of its own, frames 200–260.
4. It compares 32×18 area-averaged fingerprints with the baseline.

**Why area-averaged:** sampling 640×360 straight down to 32×18 missed a 16-pixel sprite. Averaging over 160×90 doesn't, and with determinism any difference counts.

**Time:** a full report, seven runs, takes:
- Phaser: 1.5–2.4 s;
- canvas: 0.5 s;
- Babylon.js in WebKit: 3.9 s;
- Babylon.js in headless Chromium: 31 s, because WebGL is drawn in software there. Keep e2e fixtures for 3D light.

**What the report says:**
- errors with lines and frames;
- what was blocked;
- `alert()`;
- the moments reached;
- which controls changed the picture;
- the words seen;
- a missing user language;
- the work per frame, as a mean, since WebKit's clock is coarse to 1 ms;
- "Nothing to fix" or "To fix: n".

## Brains (gate 8)

**Method:** the draft skill and its four sheets went in as the system prompt. Each answer's code was played, and the report went back to the brain, three rounds at most.

**The briefs:**
- `empty`: en "Make me a game.";
- `child`: en, recycling, a child's profile;
- `words`: ja, a word puzzle;
- `story`: fr, an adventure in a forest;
- `clone`: ar, "make me Flappy Bird";
- `3d`: en, a boat between islands.

The two local brains ran in LM Studio with a 64k context.

| Brain | empty | child | words | story | clone | 3d | Clean |
|---|---|---|---|---|---|---|---|
| Sonnet 5.5 (the owner's `claude -p`) | round 1, Phaser | 1, canvas | 1, canvas | 1, HTML | 1, canvas; says it makes an original game | 2, Babylon.js | 6 of 6 |
| Qwen3.5 4B MLX, before the two fixes below | ✗ `await` in `create()` ×3 | ✗ | ✗ | ✗ | — | — | 0 of 4 |
| Qwen3.5 4B MLX, after them | 3, Phaser | 1 | ✗ syntax | 2 | 3 | ✗ forgot an import (and its engine line was misread) | 4 of 6 |
| Qwen3.6 35B-A3B Splash, after them | 1, Phaser | ✗ items never fall: the report was right | ✗ | ✗ copied `engine:` into its code | ✗ | ✗ | 1 of 6 |

**What the runs taught:**
- **The method works unguided with a strong brain.** Every Sonnet game:
  - has a design card;
  - is in the user's language;
  - is kind for a child (no lives to lose);
  - is clean in one round, except the 3D game, which needed two.
- **The clone brief was handled as the skill asks.** Asked for Flappy Bird, Sonnet said in one line that it would make an original game of the genre, then made it.
  - **Looked at by eye:** its reeds are green capped pipes, close to the original's look. The skill should name the look in its originality step, and the test set's judge should see a picture.
- **`load()` became synchronous, and errors got hints:**
  - *Before:* the 4B brain copied the sheet's `await jean.load()` into a plain `create()`. Told the line three times, it couldn't fix "Unexpected reserved word".
  - *After:* `load()` returns at once, since the save is written into the page at boot. A short hint now follows frequent errors, for example "often `await` outside an `async` function". The same brain went from 0 of 4 clean to 4 of 6.
- **Most of the 35B's failures were the harness's, not Jean's:**
  - its thinking used up the room left for its later answers (empty answers);
  - it copied the `engine:` line into its code. In Jean that line is a tool argument.

  Its real bug, items that never fall, was reported correctly ("no control changed the picture"). A further line, "during play, nothing moved by itself", would point at the cause.
- **Phaser 4 against Phaser 3:** every Phaser game the brains wrote was played on both. Phaser 4 had the same problems or fewer each time, so Phaser 4 stays.
- **Slow is not frozen.** With software WebGL, Sonnet's first 3D report said "froze": 47 ms a frame hit the time limit. The shell now posts its progress, and the report says "too slow: n frames of 420", which is a different fix.

## Changes to the plan

1. **The game's global is `host`, not `jean`.** AGENTS.md keeps the brand out of names that last, and saved games depend on this one.
2. **No three.js and no inkjs** (owner, 28 Oct): 3D is Babylon.js through the curated kit, and stories are plain HTML.
3. **Phaser 4 stays.** It needs no bundling, as `phaser.esm.min.js` ships. Babylon.js and ZzFX go through esbuild.
4. **`host.load()` is synchronous.** The save is in the page from boot.
5. **The report:**
   - a hint after frequent errors;
   - "too slow" told apart from "froze";
   - a line when nothing moves during play;
   - HTML games fingerprinted by their markup, not their text;
   - the baseline run twice, counting only changes beyond the two baselines' own difference.
6. **Syntax errors:** the shell loads the game both as a module element and with `import()`.
7. **The loop guard is needed,** in play as in tests. If guarded code fails to parse where the original wouldn't, the shell runs the original and says so.
8. **The originality step names the look,** and the test set's judge sees pictures.
9. **To check by hand:**
   - a game in a background tab, with real Chrome and Safari;
   - a real gamepad;
   - touch buttons on a phone.

   These go in the roadmap's checklist.
10. **Context:** the skill and its sheets need about 10k tokens of context before the conversation. Brains need 64k for three rounds.

## Budget ask, measured

- **Counted lines:** the spike's frame code is 370 counted lines. Phase 1 adds the kind, the tools, the player and the cover, pause, mute and touch controls, for about 750–800 counted lines in all.
- **Each later phase:** Babylon.js adds about 40 (its kit is `scripts/vendor.js`, not counted), keep and share about 100.
- **No line of `core/`.**
- **First load:** nothing, unless the owner wants a parent's switch (a `CATALOGUE` entry).

The harness these numbers came from is in git: `git log -- spikes/games`.
