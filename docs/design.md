# Design

Minimal stack, epic result. The style has to be memorable enough that people retell it.

## Concept: Tilde

Jean's identity is **Tilde** (D373): a name everyone already has, a small wave for its mark and its presence, ink and paper, and one poppy red. It is Jean's own look and the one it starts in; every other theme keeps the mark and the wave.

- **The name.** Jean is the French form of John, a name nearly every language has its own of, and the everyday name for "anyone" in several of them. It is written with a capital J, in Latin script in every language. Nothing blue, no stitching or rivets: in English, lowercase and blue, it would be trousers.
- **The mark** is a tilde, a small wave. Seven of Jean's languages already write it: the madda over the alif in Arabic, Persian and Urdu (آ), the Japanese wave dash (〜), Vietnamese's ngã (Mỹ), Spanish's ñ and Portuguese's ã, as in João, Jean's own name there. The app's icon is the tilde over the name, set in Gentium, on ink (`icons/icon.svg`, inside the maskable safe zone); a browser's tab shows the tilde alone (`icons/favicon.svg`). Where the interface means a brain (the box's chip, Auto, Settings' Brains), the tilde sits in a circle (`icons.brain`), never a sparkle; the macOS disk image shows the wave's way from the app to Applications (`desktop/dmg-background.svg`). `npm run icons` draws the PNGs that Android and iOS install with (D131).
- **Colour.** Ink and paper: near-black and white by day, a soft black and a warm white by night, with one poppy red, deeper by day, lighter by night, for the wave, links, ticks and other small marks. Poppy is never a fill behind words and never a button: buttons and the open row are ink. The user's words sit on the margin's grey; what waits for the user, an approval or an offer, on blush by day and ember by night. Never cream: a serif on cream is another assistant's.
- **Type.** Gentium Book Plus Bold for the name and the big question, the system font for everything else (see [Typography](#typography)).
- **Corners and frame** are Human's: a floating box, rounded panes and pills, the drawer beside the conversation; Tilde's sheet builds on Human's.
- **First visit.** The wave above the question, the question in Gentium, and the box right under it, its ideas below; in a browser's tab, one sentence and three facts say what Jean is (D366). Nothing else.
- **Each project has its own colour,** which tints the wave; walking into another project cross-fades it.
- **What Jean can do is a case of trophies** (D113, D127, D316), drawn with Settings' own parts so it looks like the sections around it. In Settings' Capabilities section, the wave sits beside its rank, which rises a quarter of the case at a time: Ripple, Wave, Current, Tide, then Ocean once everything is found, things rather than people, so no rank takes a gender. The wave grows a size with each rank, as its names say, over a bar of how much is found, like Storage's. Below, each capability is a row of a list, in the case's order: its icon lit and On at its end once found, one after another as the section opens; a dashed silhouette until then, how to find it under its name, with pips when it is found by counting (two conversations, three dictations). A row opens to say what it does and to offer it: Turn on, a download, or Open. The next one to find is open as the section opens.
- **Light or dark.** Jean follows the device's light or dark mode (Auto); Settings offer Light or Dark to keep one, and that choice is kept on the device (D85, D107, D135).
- **Settings is a menu beside the section open,** like the Claude apps', in three groups: General, Brains, Appearance, Keyboard shortcuts; About you, then Skills, Routines, Connections, Web search, Computer and Plugins once each is found, then Capabilities; Approvals, Your data (D134). Each setting is a row, what it is on one side and its control on the other, with a thin line between rows; on and off are switches. A list (brains, services, skills, routines, what Jean noticed, what Jean can do) is one rounded group of rows, each an icon, a name and a line, then its controls; a row that opens shows the rest under it. Each item of the menu starts with an icon. On a phone the menu is a strip of pills above the section (D113). Brains is who answers, Auto or one of the brains, then the ways to add one, one open at a time, and opens whenever a brain is needed (D128, D134). Settings opens from the foot of the drawer; the header holds the drawer's button and the name (D117, D165).
- **The drawer, after Manus** (D165): New task, a row for each place found (Skills, Routines, Connections), then the tasks under a small heading, and the user at the foot, who stays in view as the tasks scroll under them, never showing past them. Nothing in it can be selected, as in an app's own sidebar. On a wide window it stays open beside the conversation, the header's name, Search and the button that puts it away at its top, or is put away, as the user left it on that device; until then, Tilde, the look Jean starts in, Human and Mail open it once the room has a task, so a first visit has the window to itself (D369); the other themes put it away, leaving the box alone. On a phone it slides over the conversation.
- **The user sits at the foot of the conversations** (D150): their initial in a round badge and their name, or a silhouette and "You" until Jean knows it. Their menu opens above them, as wide as they are, like the + menu above the box (D123): Settings, the language and the theme (each a page of the menu that turns back, the themes as Settings' small pictures, D154), a switch for dark mode, then what Jean can do. Each key that does the same shows beside it, where there is a keyboard. A language or a theme picked there applies at once and the menu stays, the drawer open beside the conversation staying so (D153, D165).

### How Jean's presence shows state

| State | The wave | The Room theme's light |
|---|---|---|
| Idle | Ripples slowly, travelling the way the page reads | Slow ambient breathing |
| Listening (the user types or speaks) | Swells and settles, as a voice does | Leans toward the input |
| Thinking and working | Small and quick | A subtle flicker |
| Answering | Speaks in bursts | Warms and widens |
| Waiting for approval | Holds still, tall, and pulses | Steady warm pulse on the approval card |
| Done | Becomes a smile, with a little hop, then idle | Settles |
| Something went wrong | Becomes a frown, in grey, until the next message | — |

### The wave

Jean's presence is the tilde of its mark, set moving. It is one inline SVG in `ui/persona.js` (`<app-persona>`): a long wave seen through a window whose ends fade out, a smile and a frown. CSS does all of its moving: it reads `data-presence`, which mirrors `app.presence`, plus "waiting" while an approval is open and "oops" after an error.

- **Where it lives.** Above the question on the first screen. When the conversation begins it flies into the header beside the wordmark (a view transition), and stays there showing the state; it sits beside the rank in Settings' Capabilities and on each project's card.
- **It travels the way the page reads,** left to right, and right to left in Arabic, Hebrew, Persian and Urdu.
- **At every size,** from about 7 rem on the first screen down to the header's 1.5 rem: one stroke, no detail to lose.
- **It has no words and no gender.** It never speaks, never carries text, and nothing in the interface agrees with it grammatically. It is not tied to the name either, so it survives a rename.
- **It is not in the prompt.** The base prompt stays free of personas (AGENTS.md); the wave is purely visual and decorative (`aria-hidden`).
- **A project's colour tints it.** Its colour comes from one custom property, `--tint`: Jean's poppy by default, any CSS colour otherwise. Only the hue is taken, at the lightness each mode needs, so it reads by day and by night whatever the colour. Projects (0.4) set it from the `colour` in `project.md`: on the root for the room you are in, or on one `<app-persona>` (a project's card).

## Looks

Tilde is Jean's own look and the one it starts in (D373). Settings › Appearance, and the theme page of the user's menu, offer sixteen, each with a light and a dark palette, shown as small pictures of themselves, Tilde first, then Human, then from the calmest to the most playful (D111, D120, D154, D174). Each keeps the wave:

- **Tilde:** Jean's own. Human's frame in ink and paper, Gentium for the name and the big question, the wave in poppy. Its sheet brings in Human's, whose rules apply to both.
- **Human:** after today's desktop: frosted panes that float, the system's blue and typeface (D132).
- **Mail:** after the devs.new task inbox: the tasks in a list beside the one open, as in an email client; neutral greys, one blue accent, flat surfaces.
- **Minimal** (one grey scale) and **Swiss** (a strict grid, black and white with one red).
- **Paper:** ink on paper, a serif for everything, the user's words set as a quotation in the margin's red, no glow.
- **Room:** a dark, warm room lit from where the wave sits, the display face, and the room warming a step with each discovery (D73); each project's room glows in its own colour.
- **Fjord** (polar blues under a faint aurora) and **Velvet** (plum and gold, a Didone).
- **Notebook** (squared paper and sticky notes; a blackboard by night), **Blueprint** (white lines on Prussian blue), **Classic** (a Nineties desktop) and **Mondrian** (thick lines and primaries).
- **Terminal** (green phosphor; green-bar paper by day), **Neon** (an Eighties sun behind a grid) and **Depth** (a floor in true perspective that the camera circles while Jean works, D125).

Tilde, Human and Mail open the drawer beside the conversation once there is a task (D165, D369). Names that are trademarks stay out of the UI, and `test/looks.test.js` checks every theme's text at AA by day and by night.

**Make it yours** adds an accent colour, a background colour, a text size, a typeface (sans-serif, serif, rounded or typewriter) and the user's own CSS, over any look, shown as they change. Their CSS starts from Jean's main hooks, commented out (`ui/touches.css`): the background, text and accent by night and by day, the typeface, corners and width, their requests, the answers and the box. It is kept only once changed. A picked colour keeps its hue and some of its chroma, at the lightness each mode needs for contrast, so text stays readable by day and by night. The accent also colours the wave and the room's glow, unless a project has a colour of its own.

## Typography

- **One display face** for the name and big statements: Gentium Book Plus Bold, by SIL, a book face drawn for the world's languages (D34). OFL-licensed; one Latin subset, within the 30 KB budget, declared for every weight so no bold or italic is ever made up, and renamed Display inside the file, as the OFL asks of a modified version (`fonts/OFL.txt`).
- **The system UI font for everything else.** It covers every script with zero bytes, so there's no 10 MB CJK font; in Tilde, a question in Arabic, Japanese or any other script falls back to it.
- **The wordmark is `BRAND.name` set in the display face,** so it survives a rename.
- **Big type at the start.** The first question is large and shrinks into place once the conversation begins, as the box slides to the foot.

## Techniques (pure CSS)

- **Colour:** oklch colours with `color-mix()` and relative colours (`oklch(from …)`)
- **Light:** `@property`-animated custom properties for the Room theme's light (gradients, warmth, intensity)
- **Transitions:**
  - View Transitions for unlocks and project switches
  - `@starting-style` for entry animations
  - `:not(:defined)` for undiscovered custom elements, which animate in when their module loads
- **Layout:**
  - `:has()` and container queries
  - Logical properties only, so right-to-left layouts are free
- **What it doesn't use:** no canvas, no images, no animation library and no icon pack. There are about 20 inline SVG icons, and one inline SVG wave.

## Accessibility

- **WCAG AA contrast at every stage**, measured in pixels in every look, mood, warmth and project colour (D325). "Dark" applies to ambient surfaces only; text is always high-contrast.
- **`prefers-reduced-motion`:** nothing moves (D325). The wave keeps its poses (small, tall, a smile, a frown), so each state still reads.
- **`prefers-contrast: more`:** stronger borders and flat surfaces, and the wave in the ink's colour.
- **`forced-colors`** is supported. The wave takes the system's text colour.
- **Keyboard:** fully navigable, with focus that is always visible. ⌘, opens Settings, ⌘/ its keyboard shortcuts, ⌘⇧O a new conversation (⌘N too where the browser lets it through), ⌘⇧D switches between light and dark, ⌘⇧E goes to the next theme, ⌘⇧L to the next language, ⌘⇧S dictates, ⌘K opens search, ⌘⇧B the browser and ⌘⇧H talks hands-free once each is found, ⌘J the terminal, ⌘B the drawer, ⌘S saves a copy of the open task and ⌘⌫ deletes it after asking, Ctrl outside Apple's systems, and Escape stops an answer once nothing over it, or with the keyboard, takes it (D118, D313, D315).

## Budget

| Item | Limit |
|---|---|
| CSS | ≤ 12.6 KB gzipped for the room; another look adds its own file only when chosen |
| Display font | ≤ 30 KB |
| Images | 0 |
| Icons | ~20 inline SVGs |
| Presence | One inline SVG, animated with CSS only |
