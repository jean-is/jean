# Reels

Jean's videos of itself: short films of Jean doing real tasks, played by Jean itself, for jean.is's pages, its help, and, exported to a video file, the README and anywhere a page can't go. What a reel is, the rules every reel follows, the player, the slate (the reels made and those still to make, each with its storyboard), the sound, the export, and the work left, written so that another agent can pick it up.
- **How it works:** [architecture.md](architecture.md#reels).
- **Why:** [decisions.md](decisions.md), D687. Built on the demo (D457) and the guided tour's stops.
- **Where it lives:** `site/watch/`, jean.is's page that plays them (`/watch`, `/fr/regarder`, `/ar/watch`, `/ja/watch`), which writes the player (`reel.html`) and every reel in each of its languages; `npm run reel` exports one.

## What a reel is

A reel is scenes end to end, each a **card** (the wave, a title or the name, a line, facts ticked, a way in) or a **task**: a task Jean did, played again in Jean's own conversation by `demo.html` (D457), with **stops** along it. A stop is a guided tour's stop, timed: it holds the replay while a caption says what shows, and may point at it with the pointer, frame it with the camera, and click it, as a viewer would.

Nothing in a reel is a recording or a drawing of Jean. The conversation is Jean's, live: it plays in the viewer's language and direction, by day or by night, in their look, and a change to Jean's interface reaches every reel at once. A reel paces itself in each language: a stop holds as long as its caption takes to read there.

## Principles

1. **Jean is the footage.** Never a mock-up, a screenshot or a second drawing that drifts (D457). The player draws only what isn't Jean's: the window around it, the captions, the pointer, the cards.
2. **One clock.** Everything a reel shows or plays is a function of its time, the replay's waits included (`demo.js` lends them to the reel). Pause, seek, speed, a language changed halfway and a frame-exact export are one mechanism.
3. **Tell, then show.** A caption holds the replay while it speaks, so the eye never chooses between reading and watching. One idea a caption, about 90 characters at most, in Jean's words: no "agent", "model", "MCP" or "token". It says only what shows.
4. **Motion with a purpose.** The camera moves only to frame what a caption names, in 0.9 s, eased in and out, closer or a little further back, and goes back once it is read; nothing bounces; words rise a few pixels and fade, one after the other in their language's own words. The tilde is drawn the way the page reads and never mirrored. With less motion asked for, the camera cuts and nothing travels.
5. **Sound helps, never carries.** The score is quiet, original and tied to the reel's time; everything it says is in the captions, and a reel is whole muted.
6. **Readable at every size.** The conversation is magnified in its window; captions and controls are sized by the player, not by the scene, so a reel framed small on a phone still reads. A caption moves to the top while what its stop points at sits under it, as subtitles do.
7. **Honest numbers.** A task's figures are worked out from the data the page names (the sample spreadsheet, as /excel's), never typed in.

## The player

`reel.html#reel=<name>&lang=<lang>` plays one reel, framed by any page of the site, or opened alone. `theme` and `look` in its address choose them, as `demo.html`'s do; `t` starts at a second; `autoplay` plays muted, never with less motion asked for; `export` is for `npm run reel`.

| Control | Mouse or touch | Keyboard |
|---|---|---|
| Play, pause, play again | Play under the first card, the stage, the bar's button | Space, K |
| Seek | the progress bar, a segment a chapter | ← → 5 s (mirrored right to left), J L 10 s, Home End, 0–9 |
| Chapters | the bar's segments; the chapter's name beside the time | Page Up, Page Down |
| Speed | 0.5× to 2×, a menu | < and > |
| Language | the reel's languages by their own names; it goes on where it was in its scene | — |
| Sound | on or off | M |
| Full screen | the bar's button, a double click on the stage; the window filled where a browser can't | F |

- **Captions are live text,** in a polite live region with each card's words, so a screen reader reads the reel; the replay itself is hidden from it, as a video's pixels are.
- **Speed and sound are kept** in the browser, a viewer's convenience, never needed.
- **The page frames it at 16:9,** loaded once near, full screen allowed.

## The slate

| Reel | For | Plays on | Length | Status |
|---|---|---|---|---|
| `jean`: Jean in a minute | a first visit, who has used ChatGPT | /watch, the README, social posts | 58 s | made |
| `spreadsheet`: A spreadsheet, answered | people searching for AI for Excel | /watch, then /excel | 46 s | made |
| `asks-first`: Jean asks first | help: what Jean asks before doing | /watch, then help's article | 29 s | made |
| `first-task`: Your first task | help: a first request | /watch, then help's article | 26 s | made |
| `history`: Bring your ChatGPT history | the homepage's story (D668) | the homepage, /import | ~35 s | to make: needs the room, not only a conversation |
| `any-ai`: Every AI, one box | people choosing an AI | /compare | ~30 s | to make: Auto, and what an answer says of where it was done |
| `family`: A tutor that doesn't give the answer | parents | /family | ~30 s | to make |
| `offline`: An AI with no connection | /offline's readers | /offline | ~25 s | to make: its task is written already |
| `made`: Slides, diagrams, documents | people who make things for work | /slides, /diagrams | ~35 s | to make: decks and diagrams already replay |
| `folders`, `routines`, `sync` | people who found those capabilities | help's articles | ~25 s each | to make: need the room |

Lengths are English's; French's run a few seconds longer, Arabic's shorter.

### `jean`: Jean in a minute

| Chapter | Scene | Caption |
|---|---|---|
| Jean | Card: the tilde draws itself, the name, the homepage's promise | — |
| Files in, things out | A spreadsheet and a question; the program, framed while it runs; the chart, framed | Drop in a spreadsheet and ask, in your own words. · The sums are worked out by a program, in a sandbox in your browser. Not guessed. · And back comes what you asked for, made. |
| Any AI | A letter, written by the AI on this computer; what the answer says of it, framed | Use GPT, Claude, Gemini, or an AI on your own computer. · Each answer says which AI wrote it. This one never left the computer. |
| It asks first | Minutes to send; the approval card; Allow once, framed and clicked | Before it sends, shares or deletes anything, Jean asks you. |
| Keep everything | Card: three facts, ticked | Your history, files and memory stay on your device. · As plain files, in one backup you can take anywhere. · Free and open source. |
| Your turn | Card: the tilde, Open Jean | — |

### `spreadsheet`: A spreadsheet, answered

Card · the sample's file, then its question, each pointed at · the AI asked · the program, framed while it runs · the chart, framed · Show the data, clicked, the table opening · what was read · card: try it with the sample (`?sample`) or your own spreadsheet.

### `asks-first`: Jean asks first

Card · the request to send the minutes · the approval card framed: what goes, and where · Allow once, pointed at and clicked · sent · card: its own files it reads and writes; sending, sharing and deleting it asks first; passwords and payments, never.

### `first-task`: Your first task

Card · a request in everyday words · the AI asked · the note written as it comes · Read aloud under it, framed, the caption above it · card: nothing to install.

## Sound

The score is written as code (`site/watch/score.js`) and played by Web Audio: no recording, no sample and no licence but Jean's own (MIT), so every reel's sound is Jean's to give. It is the same for a seed every time, which an export relies on.

- **Its parts:** a soft pad of two detuned saws, an electric piano by frequency modulation, a round bass, a light kick, rim and shaker, in a reverb drawn from seeded noise; at 88 beats a minute, in D major, eight bars that turn: Dmaj9, Bm9, Gmaj9, A6sus, then Dmaj9/F♯, Gmaj7, Em9, Asus4.
- **It follows the reel:** pad and piano alone on the cards before any task, the bass and shaker with the first task, the kick and rim from the second, then the last card resolves on D at its first bar line and rings out with the reel. A soft tick where the pointer clicks, a breath of air as each scene comes.
- **Its time is the reel's:** paused, it is suspended; sought, it starts again where the reel is, the chord under way held over; at 2×, it plays twice as fast at the same pitch.
- **Its mix:** nothing under 40 Hz, the bass kept round and low, a gentle compressor; −18 LUFS integrated and a true peak of −2 dBFS for `jean`, as `npm run reel` measures it with ffmpeg's EBU R128 meter.

## Export

```bash
npm run reel -- jean --lang en
```

`scripts/reel.js` serves the site as `npm run dev:home` does, opens the reel in Chromium with `export` in its address, loads every task's frame first, renders the score offline and measures it, then puts Playwright's clock in the page's place and steps it frame by frame: each step moves every timer and animation frame of the player and of its frames by exactly one frame, the player setting Jean's own CSS animations to the same time, then takes a picture. So the video is the same each time and drops no frame, however slow the machine: a 1080p minute takes a while. ffmpeg writes `dist/reels/<name>.<lang>.mp4` (H.264 at CRF 18 and AAC, 1920 × 1080, 30 frames a second) and `<name>.<lang>.webp`, a silent animated preview at 15 frames a second. Options: `--theme light|dark`, `--size 1920x1080`, `--fps 30`, `--preview-width 960`, `--out dist/reels`. It needs ffmpeg, and Playwright's Chromium (`CHROMIUM` names another).

The README shows `docs/reel.webp`, the preview of `jean` in English by day, linking to jean.is/watch, where it plays with sound in every language.

## Adding a reel

1. Write its scenes in `site/watch/reels.js` (cards, and tasks with their stops, `ON`'s selectors for what they point at), and its words in each `site/watch/<lang>.json`, the reel's title and line on the page too.
2. `npm run dev:home`, then /watch: watch it in English, Arabic and Japanese, by day and by night, at a phone's width.
3. `npm test` holds every stop to a moment its task reaches; `npm run e2e -- watch` holds the replay to its plan in a browser (`drift`).
4. Export it where a page can't play it: `npm run reel -- <name>`.

## Work left

- [ ] The room in a reel: the drawer, Settings and the box, for `history`, `folders`, `routines` and `sync`, as a demo of the room rather than of one conversation.
- [ ] /excel, /offline and help's articles play their reel in place of their demo's tour, which `demo.js`'s tour and play button would then no longer need.
- [ ] A portrait reel for phones and social posts, the conversation laid out narrow.
- [ ] The homepage's reel, once its story's reel (`history`) is made, and /watch in the foot.
- [ ] Each language's video beside jean.is/watch, for the press.
- [ ] Korean, as the homepage has it.
