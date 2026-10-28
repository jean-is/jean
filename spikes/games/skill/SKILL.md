# Make a game

Design the game, build it with `game`, play it and fix it before showing it. Decide whatever
the request leaves open and keep going: a first version that plays is worth more than a question.
A game is never a ```html page.

## Steps

1. Take what the request gives: a theme, a genre, who plays and their age, a picture,
   a lesson to practise, a length. Fill the rest with these: one player, one screen,
   one verb, rounds of one to three minutes, played with keys, touch or a gamepad.
2. If the request names an existing game, its characters, levels or art, make an original
   game in its genre instead, with its own name, rules, characters and look, and say so
   in one sentence.
3. Write the design card, in your answer and as `game`'s `card`, 120 words at most:
   - Title, and the fantasy in one sentence: "You are… and you must…".
   - The verb: the one action the player repeats, and why repeating it is fun.
   - The loop: thirty seconds of play, how a round ends, how it starts again.
   - The curve: what gets harder and when; the first twenty seconds can't be lost.
   - Controls: the actions used (left, right, up, down, a, b) and what each does.
   - Look and sound: three to five colours, the shapes, three sounds.
   Three pillars at most; what serves none of them is cut.
4. Choose the engine for what makes it fun, and read its sheet beside these steps
   before writing code:
   - `phaser`: motion in 2D — arcade, platformer, top-down, physics. `game/phaser.md`
   - `babylon`: when depth is the fun, in 3D. `game/babylon.md`
   - `none`: turns, rules and stories — board, card, word, logic games, stories
     with choices. `game/canvas.md`
5. Build the verb first and make it feel good before adding anything (`game/feel.md`):
   act on key down, buffer input for a few frames, forgive a late jump, give every action
   a sound and a reaction; halve motion and drop shake when `jean.reduced` is true.
6. Then the loop, the curve and the content. Every number goes in one `TUNING` object at
   the top. One new thing at a time; difficulty up about a tenth per stage, capped, with a
   breather after each peak.
7. Draw and sound everything from code: shapes, gradients, pixel sprites written as rows
   of characters, particles; sounds as ZzFX parameter lists through `jean.sound()`.
   Nothing from the internet, and no picture or sound file the user didn't give.
   What matters stands out by shape as well as colour, at 3:1 contrast or more.
8. Every word the player reads is in the user's language, in one `WORDS` object; numbers
   through `Intl.NumberFormat`; text 16 pixels or larger on a phone; right to left in
   Arabic, Hebrew, Persian and Urdu.
9. Use what the frame gives instead of rebuilding it: the cover that starts the game,
   pause, mute, full screen, touch buttons for the actions, `jean.save()`. Report moments
   with `jean.state('play' | 'over' | 'won')` and `jean.score(n)` so it can be tested.
10. Make it kind to play: an easier mode on the title (slower, more lives), three
    flashes a second at most, no timer on reading, nothing that only sound tells.
11. Read the report each `game` call returns: it plays the game and says what broke,
    what each control did and which moments it reached. Fix what it says and call again;
    after three rounds without a clean report, make the game smaller, not larger.
12. Hand it over in three lines: what it is, how to play, and three ideas to grow it
    (a new obstacle, a level, a mode) the user can ask for in their own words.
    Don't end with a question.
13. To change a game, use `game_change` with the smallest passages; `TUNING` stays the
    one place for numbers, and the card changes when the design does.

For a child's profile: nothing gory or frightening for their age, no betting or prizes
of chance, no daily rewards or streaks, no shop, no timer that punishes; losing is gentle
and playing again is one key away. For everyone: no ads, no fake purchases, no links out.

## What the frame gives

The game is one JavaScript module. It runs offline in a frame that already has a cover
to start it, pause, mute, full screen and touch buttons. Its global `jean`:
- `jean.stage`: the element to draw in, the whole frame.
- `jean.input.down(action)`, `jean.input.pressed(action)` (this frame only), `jean.input.on(action, fn)`,
  for `left`, `right`, `up`, `down`, `a`, `b`, from arrows or WASD, Space, Z or Enter (`a`),
  X or Shift (`b`), touch buttons and gamepads.
- `jean.sound(...zzfxParams)`: a ZzFX sound, silent when muted.
- `jean.save(value)`, `jean.load()`: JSON kept between visits, 64 KB at most; `load()` returns it at once.
- `jean.state(name)`, `jean.score(n)`: the game's moments and score.
- `jean.reduced`: true when the player asked for less motion. `jean.lang`, `jean.dir`: the language and direction.
Pausing stops the clock for the whole frame: nothing to do for it.
