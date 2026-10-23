# Design

Minimal stack, epic result. The style has to be memorable enough that people retell it.

## Concept: Tilde

Jean's identity is **Tilde** (D373, D376): a name everyone already has, a small wave for its mark and its presence, ink and paper, and one sunflower yellow. It is Jean's own look and the one it starts in; every other theme keeps the mark and the wave.

- **The name.** Jean is the French form of John, a name nearly every language has its own of, and the everyday name for "anyone" in several of them. It is written with a capital J, in Latin script in every language. Its colour is sunflower, never denim's indigo, and nothing is stitched or riveted: in English, lowercase and in indigo, it would be trousers.
- **The mark** is a tilde, a small wave. Seven of Jean's languages already write it: the madda over the alif in Arabic, Persian and Urdu (آ), the Japanese wave dash (〜), Vietnamese's ngã (Mỹ), Spanish's ñ and Portuguese's ã, as in João, Jean's own name there. The app's icon is the tilde alone, in ink on sunflower (`icons/icon.svg`, inside the maskable safe zone), and a browser's tab shows the same (`icons/favicon.svg`); no name in either, since words in an icon turn to a smudge below 40 px, and the name is beside the mark everywhere else. Where the interface means a brain (the box's chip, Auto, Settings' Brains), the tilde sits in a circle (`icons.brain`), never a sparkle; the macOS disk image shows the wave's way from the app to Applications (`desktop/dmg-background.svg`). `npm run icons` draws the PNGs that Android and iOS install with (D131).
- **Colour.** Ink and paper: near-black and white by day, a soft black and a warm white by night, with one sunflower yellow, `#f7c531` (`oklch(0.845 0.161 88)`), for the wave, links, ticks and other small marks; red is left to what went wrong. By night sunflower is used as it is, at 11:1 on the room. By day it is 1.6:1 on white, so it is deepened to the lightest shade that meets WCAG AA: `oklch(0.64 … 88)` for the wave, a graphic at 3:1, and `oklch(0.54 … 88)` for links and ticks, text at 4.5:1, on the page and on the margin's grey alike. Sunflower is never a fill behind words, but for the highlighter on jean.is's pages ([Drawn by hand](#drawn-by-hand)), and never a button: buttons and the open row are ink. The user's words sit on the margin's grey; what waits for the user, an approval or an offer, on a pale yellow by day and a deep one by night. Never cream: a serif on cream is another assistant's.
- **Type.** Gentium Book Plus Bold for the name and the big question, the system font for everything else (see [Typography](#typography)).
- **Corners and frame** are Human's: a floating box, rounded panes and pills, the drawer beside the conversation; Tilde's sheet builds on Human's.
- **First visit.** The wave above the question, the question in Gentium, and the box right under it, its ideas below; in a browser's tab, one sentence and three facts say what Jean is (D366). Nothing else.
- **Each project has its own colour,** which tints the wave; walking into another project cross-fades it.
- **What Jean can do is a case of trophies** (D113, D127, D316, D540), drawn with Settings' own parts so it looks like the sections around it. In Settings' Capabilities section, a title and a line, a bar of how much is found under it, like Space used's; no rank names the steps (D482), and no wave grows. Below, the capabilities in seven groups by what each is for, a row each: its icon lit once found, with what it does; a dashed silhouette until then, how to find it under its name, with a dot a step when it is found by counting (two conversations, three dictations); a solid one turned off. A word at a row's end only where it isn't simply on, on Jean's pale yellow when it waits for the user. A row opens its page, where it is turned on, downloaded, opened or turned off.
- **Light or dark.** Jean follows the device's light or dark mode (Auto); Settings offer Light or Dark to keep one, and that choice is kept on the device (D85, D107, D135). The user's menu calls it Light or dark too, and says how it stands (D523).
- **Settings is a menu beside the section open,** like the Claude apps', in three groups: General, Brains, Appearance, Keyboard shortcuts; About you, then Skills, Routines, Connections, Web search, Computer and Apps once each is found, then Capabilities; Approvals, Your data (D134). Each setting is a row, what it is on one side and its control on the other, with a thin line between rows; on and off are switches. A list (brains, services, skills, routines, what Jean noticed, what Jean can do) is one rounded group of rows, each an icon, a name and a line, then its controls; a row that opens shows the rest under it. Each item of the menu starts with an icon. On a phone the menu is a strip of pills above the section (D113). Brains is who answers, Auto or one of the brains, then the ways to add one, one open at a time, and opens whenever a brain is needed (D128, D134). Settings opens from the foot of the drawer; the header holds the drawer's button and the name (D117, D165).
- **The drawer, after Manus** (D165): New task, a row for each place found (Skills, Routines, Connections), then the tasks under a small heading, and the user at the foot, who stays in view as the tasks scroll under them, never showing past them. Nothing in it can be selected, as in an app's own sidebar. On a wide window it stays open beside the conversation, the header's name, Search and the button that puts it away at its top, or is put away, as the user left it on that device; until then, Tilde, the look Jean starts in, Human and Mail open it once the room has a task, so a first visit has the window to itself (D369); the other themes put it away, leaving the box alone. On a phone it slides over the conversation.
- **The user sits at the foot of the conversations** (D150): their initial in a round badge and their name, the first name they set, or else the profile's, or else what the account they signed in with at work calls them, or a silhouette and "You" until Jean knows one. Their menu opens above them, as wide as they are, like the + menu above the box (D123): Settings, the language and the theme (each a page of the menu that turns back, the themes as Settings' small pictures, D154), a switch for dark mode, then what Jean can do. Each key that does the same shows beside it, where there is a keyboard. A language or a theme picked there applies at once and the menu stays, the drawer open beside the conversation staying so (D153, D165).

### How Jean's presence shows state

| State | The wave | The Room theme's light |
|---|---|---|
| Idle | Still, its ripples held (D420) | Still (D420) |
| Listening (the user dictates, or hands-free hears them) | Swells and settles, as a voice does | Leans toward the input |
| Thinking and working | Small and quick | A subtle flicker |
| Answering | Speaks in bursts | Warms and widens |
| Waiting for approval | Holds still, tall, and pulses twice | Steady warm pulse on the approval card |
| Done | Becomes a smile, with a little hop, then idle | Settles |
| Something went wrong | Becomes a frown, in grey, until the next message | — |

### The wave

Jean's presence is the tilde of its mark, set moving. It is one inline SVG in `ui/persona.js` (`<app-persona>`): a long wave seen through a window whose ends fade out, a smile and a frown. CSS does all of its moving: it reads `data-presence`, which mirrors `app.presence`, plus "waiting" while an approval is open and "oops" after an error.

- **Where it lives.** Above the question on the first screen. When the conversation begins it flies into the header beside the wordmark (a view transition), and stays there showing the state; it sits beside how many are found in Settings' Capabilities and on each project's card. On paper, a printed task or one saved as PDF starts with it, still, before the name and, small, Jean's address, its links take the project's colour, deepened for paper, and its sources show open, each web page's site after its title. Beside the name in the header, the name's box is trimmed to its x-height, so that the wave sits on the middle of its lower-case letters in every look.
- **While Jean works it travels the way the page reads,** left to right, and right to left in Arabic, Hebrew, Persian and Urdu; at rest it is still, the mark's tilde at its middle, rising then falling, so nothing on the page moves for long unasked (D420).
- **At every size,** from about 7 rem on the first screen down to the header's 1.5 rem: one stroke, no detail to lose.
- **It has no words and no gender.** It never speaks, never carries text, and nothing in the interface agrees with it grammatically. It is not tied to the name either, so it survives a rename.
- **It is not in the prompt.** The base prompt stays free of personas (AGENTS.md); the wave is purely visual and decorative (`aria-hidden`).
- **A project's colour tints it.** Its colour comes from one custom property, `--tint`: Jean's sunflower by default, any CSS colour otherwise. Its hue is taken, and its chroma up to a limit, at the lightness each mode needs, so it reads by day and by night whatever the colour, and a grey stays grey. Projects (0.4) set it from the `colour` in `project.md`: on the root for the room you are in, or on one `<app-persona>` (a project's card). A project's dialog offers eight, sunflower first and a project without one shown in it, then green, teal (Jean's former water), blue, violet, fuchsia and rose: none in sunflower's own band, where amber and olive would look like it (to red-green colour-blind eyes by day, amber is sunflower), and none on the red of errors. Last, grey, Tilde's warm neutral at its paper's hue, told apart from the others by having no colour: the most distinct of any eighth; where a look shows the room, it glows sunflower.

## Looks

Tilde is Jean's own look and the one it starts in (D373). Settings › Appearance, five to a row, each on Auto with its other palette folded into its corner (D523), and the theme page of the user's menu, offer fifteen, each with a light and a dark palette, shown as small pictures of themselves, Tilde first, then Human, then from the calmest to the most playful (D111, D120, D154, D174). Each keeps the wave:

- **Tilde:** Jean's own. Human's frame in ink and paper, Gentium for the name and the big question, the wave in sunflower. Its sheet brings in Human's, whose rules apply to both.
- **Human:** after today's desktop: frosted panes that float, the system's blue and typeface (D132).
- **Mail:** after the devs.new task inbox: the tasks in a list beside the one open, as in an email client; neutral greys, one blue accent, flat surfaces.
- **Minimal** (one grey scale) and **Swiss** (a strict grid, black and white with one red).
- **Paper:** ink on paper, a serif for everything, the user's words set as a quotation in the margin's red, no glow.
- **Room:** a dark, warm room lit amber from where the wave sits, the display face, and the room warming a step with each discovery (D73); each project's room glows in its own colour.
- **Fjord** (polar blues under a faint aurora) and **Velvet** (plum and gold, a Didone).
- **Notebook** (squared paper and sticky notes; a blackboard by night), **Blueprint** (white lines on Prussian blue), **Classic** (a Nineties desktop) and **Mondrian** (thick lines and primaries).
- **Terminal** (green phosphor; green-bar paper by day) and **Neon** (an Eighties sun behind a grid).

Tilde, Human and Mail open the drawer beside the conversation once there is a task (D165, D369). Names that are trademarks stay out of the UI, and `test/looks.test.js` checks every theme's text at AA by day and by night.

**Make it yours** adds an accent colour, the theme's own, one of the eight colours projects use or any other, a text size, a typeface (sans-serif, serif, rounded or typewriter) and the user's own CSS, over any look, shown as they change; Settings › Appearance puts the text size and typeface first, under Comfort, with light or dark and motion (D523). A background colour is an organisation's (D500) or the CSS's. Their CSS starts from Jean's main hooks, commented out (`ui/touches.css`): the background, text and accent by night and by day, the typeface, corners and width, their requests, the answers and the box. It is kept only once changed. A picked colour keeps its hue and some of its chroma, at the lightness each mode needs for contrast, so text stays readable by day and by night. The accent also colours the wave and the room's glow, unless a project has a colour of its own.

## Typography

- **One display face** for the name and big statements: Gentium Book Plus Bold, by SIL, a book face drawn for the world's languages (D34). OFL-licensed; one Latin subset, within the 30 KB budget, declared for every weight so no bold or italic is ever made up, and renamed Display inside the file, as the OFL asks of a modified version (`fonts/OFL.txt`).
- **The system UI font for everything else.** It covers every script with zero bytes, so there's no 10 MB CJK font; in Tilde, a question in Arabic, Japanese or any other script falls back to it.
- **The wordmark is `BRAND.name` set in the display face,** so it survives a rename.
- **Big type at the start.** The first question is large and shrinks into place once the conversation begins, as the box slides to the foot.

## Icons

Every glyph Jean draws is one set, Tilde's, inline SVG in the current colour, and each glyph has one meaning: a person learns an icon by what it did the last time (D393). The first screen's glyphs (the box and the line under it, the answers, the header) are in `ui/icons.js`; the others that more than one module draws are in `ui/menu-icons.js`, which the drawer, the menus, Settings and the capabilities load; a glyph only one capability draws stays in its module. All are drawn with the same `icon()`, and `test/icons.test.js` checks the rules it can.

jean.is's pages draw the same glyphs. `site/site.js` takes each glyph a page shares a meaning with from these two modules, so a lock, a key or a PDF looks the same on a page and in Jean, and draws in the same grid only what no glyph of the app means: a clock, a place on a map, a tune, a family tree, a bar chart, a small app's window and "never".

- **One grid, four keylines.** 24 units with 3 of margin. A glyph fills one of four keylines, each 17 units on its long side: a circle 17 across, a square of 15, a portrait 13 × 17 and a landscape 17 × 13, centred on 12, 12. A glyph that points, like a bolt or a star, may reach a unit past, never outside 2–22.
- **One pen, the text's.** Every stroke is 1.5 px at every size (`--pen`, with `vector-effect: non-scaling-stroke`), about the stem of the system font beside it; 2 px when the device asks for more contrast, 1.25 px in Minimal.
- **Human's corners.** A shape 11 units or larger takes a radius of 2.5, a smaller one 1.5; every cap and join is round, like the ends of the tilde; two parallel strokes stay 3 units apart, so nothing fills in at 16 px.
- **A frame says where, a mark says what.** The frames are a laptop for a computer, a window for this tab and a lens for searching; the marks are the tilde for a brain, `>_` for commands and the globe for the web. The laptop alone is the Computer, wherever it shows: its Settings, the case, its storage and the button at the top that opens its terminal. A new capability's glyph combines two of them: Web search is the lens over the globe, a brain on this device the tilde on its laptop, This computer `>_` on it. Capabilities, the case of trophies, wear a cup; Apps tiles, the last one turned on its corner, what others made joining what Jean does.
- **The tilde means a brain, and only a brain:** any brain (in a circle), a brain on this device, Search by meaning and Live conversation, each half a wave 5 units across and 2 high, never mirrored. A brain is never a sparkle, a robot or a chip.
- **Solid means a state.** Nothing is filled for decoration: a fill marks what is on (the unread dot, a menu's dots, a keyboard's keys), in the stroke's colour, never water.
- **It turns with the page.** A glyph that points along the line (an arrow, the drawer, a list, a branch) has `flip-rtl`, mirrored in Arabic, Hebrew, Persian and Urdu; clocks, ticks, play, search and the tilde stay as drawn.
- **Three sizes.** `--icon-s` (1rem) in menus, chips and inline with text, `--icon-m` (1.25rem) in buttons and Settings' menu, `--icon-l` (1.75rem) for a ready-made skill, a file Jean made and a picture on its way; a place sets `--glyph` to one of them.

## Drawn by hand

The app is drawn with one pen; jean.is's pages (`site/`) are drawn on by hand as well, so the page reads as made by a person (D443). Each drawing is inline SVG without a word in it, hidden from screen readers, gone in forced colours, turned round right to left; no image and no script.

- **The felt-tip pen, on every page.** `site.js`'s `FELT` marks what the page most wants read, a few times a page: it underlines the phrase of the title that its words name (`h1.mark`), circles a number, ticks the hero's facts, points at a button from beside it, strikes through, and highlights a line. It writes in Jean's sunflower where it underlines and highlights, under ink, and, by day, in the wave's shade (3:1) where it draws a line of its own. The highlighter is the one place sunflower sits behind words, by day, ink on it at 11:1; by night it is a band under the words, never behind light ones.
- **One medium per audience.** The family page has a child's wax crayon, in a child's colours, lighter by night: the sun in a corner, the family on the grass under the profiles and a kite whose tail is the tilde, then the family's ideas as notes on a fridge door, held by tape and magnets, Jean's magnet its icon. The page for IT draws the request's path as on a whiteboard, a dotted board and two passes of the marker. The comparison pages draw in marker in their top's empty half, a balance, level, on the hub and two windows on a product's page, what one brings over carried from the other to Jean's, and the felt-tip draws the browser's fence round and strikes through what is out of its reach.
- **Where it shows.** The big drawings need a wide window; on a phone the marks stay and the underline lets the title wrap.

## Techniques (pure CSS)

- **Colour:** oklch colours with `color-mix()` and relative colours (`oklch(from …)`)
- **Light:** `@property`-animated custom properties for the Room theme's light (gradients, warmth, intensity)
- **Transitions:**
  - View Transitions for unlocks and project switches
  - `@starting-style` for entry animations
  - `:not(:defined)` for undiscovered custom elements, which animate in when their module loads
  - Anchor positioning for a segmented control's choice: its fill is one mark under the choices, anchored to the one chosen, which slides to the next (`ui/dialogs.css`, Share's choices and jean.is's filter too); Classic's buttons go in where they are, and a browser without anchors fills the choice in place
- **Layout:**
  - `:has()` and container queries
  - Logical properties only, so right-to-left layouts are free
- **What it doesn't use:** no canvas, no images, no animation library and no icon pack: the icons are Jean's own set ([Icons](#icons)), and the wave one inline SVG more.

## Accessibility

- **WCAG AA contrast at every stage**, measured in pixels in every look, mood, warmth and project colour (D325). "Dark" applies to ambient surfaces only; text is always high-contrast.
- **`prefers-reduced-motion`:** nothing moves (D325), unless the user asked for Full in Settings › Appearance › Motion; and where they asked for Less, nothing moves whatever the device asks (D523). The wave keeps its poses (small, tall, a smile, a frown), so each state still reads.
- **Scrolling glides** (`scroll-behavior: smooth` on the page) wherever a link, focus or Jean takes it, except while reduced motion is preferred and while Jean thinks or answers. Then the page follows the answer's end in jumps, and a reader who goes up (focus moving to an earlier message, say) jumps too, so the next jump to the end never cancels their glide halfway. Opening a conversation at its end jumps as well.
- **Zoom and large text:** at 320 pixels wide or with text at 200%, nothing is cut or hidden and the page never scrolls sideways; under 20rem tall the box stays in the page's flow rather than at the window's foot (D420).
- **Targets** are at least 24 by 24 pixels, or spaced as far (D420).
- **Controls at 3:1** (D420): a text box's frame in the soft or faint ink, the section and task open ringed, an icon that names a button, and focus rings drawn whole, in every look by night and by day.
- **`prefers-contrast: more`:** stronger borders and flat surfaces, the icons' pen at 2 px, and the wave in the ink's colour.
- **`forced-colors`** is supported. The wave takes the system's text colour.
- **Keyboard:** fully navigable, with focus that is always visible. ⌘, opens Settings, ⌘/ its keyboard shortcuts, ⌘⇧O a new conversation (⌘N too where the browser lets it through), ⌘⇧D switches between light and dark, ⌘⇧E goes to the next theme, ⌘⇧L to the next language, ⌘⇧S dictates, ⌘K opens search, ⌘⇧B the browser and ⌘⇧H talks hands-free once each is found, ⌘J the terminal, ⌘B the drawer, ⌘S saves a copy of the open task, Ctrl outside Apple's systems, and Escape stops an answer once nothing over it, or with the keyboard, takes it (D118, D313, D315).

## Budget

| Item | Limit |
|---|---|
| CSS | ≤ 12.6 KB gzipped for the room; another look adds its own file only when chosen |
| Display font | ≤ 30 KB |
| Images | 0 |
| Icons | One set of inline SVGs, the first screen's glyphs alone in the first load ([Icons](#icons)) |
| Presence | One inline SVG, animated with CSS only |
