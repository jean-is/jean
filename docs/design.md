# Design

Minimal stack, epic result. The style has to be memorable enough that people retell it.

## Concept: the room lights up

A nod to *A Dark Room*. **Jean is the light source.** Its presence is felt in how the room is lit, and when you look at the light, it looks back: a little flame with a face (see [The little light](#the-little-light)).

- **First visit.** A dark, warm room, the little light, and one line of very large type: the question. Nothing else.
- **Discovery lights the house.** Each discovered capability "catches the light": its surface warms in from the shadow, and the palette warms a step. When everything has been discovered, the house is in full daylight. People feel their progress instead of counting it.
- **Each project is a room** with its own light colour. Switching project feels like walking into another room, with the ambient light cross-fading.
- **What Jean can do is the house, kept as a case of trophies** (D113, D127). In Settings' Capabilities section, the little light sits in a ring with a segment for each capability, lit as each is found. Beside it is its rank, which rises a quarter of the case at a time: Spark, Candle, Lantern, Hearth, then Daylight once everything is found. The light grows a size with each rank. Below, each capability is a medal: amber once found, catching the light one after another as the section opens; a dashed silhouette until then, with pips when it is found by counting (two conversations, three dictations). A plaque shows the medal picked, at first the next one to find: how to find it, what it does, and what it offers.
- **Light mode tells the same story by day,** with paper and ink: progression shows as warmth and ink density. Jean follows the device's light or dark mode (Auto); Settings offer Light or Dark to keep one, and that choice is kept on the device (D85, D107, D135).
- **Settings is a menu beside the section open,** like the Claude apps', in three groups: General, Brains, Appearance; About you, then Connections, Skills and Routines once each is found, then Capabilities; Approvals, Your data (D134). Each setting is a row, what it is on one side and its control on the other, with a thin line between rows; on and off are switches. A list (brains, services, skills, routines, what Jean noticed) is one rounded group of rows, each an icon, a name and a line, then its controls; a row that opens shows the rest under it. Each item of the menu starts with an icon. On a phone the menu is a strip of pills above the section (D113). Brains is who answers, Auto or one of the brains, then the ways to add one, one open at a time, and opens whenever a brain is needed (D128, D134). Settings opens from the foot of the drawer; the header holds the drawer's button and the name (D117, D165).
- **The drawer, after Manus** (D165): New task, a row for each place found (Connections, Skills, Routines), then the tasks under a small heading, and the user at the foot. On a wide window it stays open beside the conversation, the header's name, Search and the button that puts it away at its top, or is put away, as the user left it on that device; Mail and Glass start with it open, the other themes put away, so the first screen is the box alone. On a phone it slides over the conversation.
- **The user sits at the foot of the conversations** (D150): their initial in a round badge and their name, or a silhouette and "You" until Jean knows it. Their menu opens above them, as wide as they are, like the + menu above the box (D123): Settings, About you, the language and the theme (each a page of the menu that turns back, the themes as Settings' small pictures, D154), a switch for dark mode, what Jean can do, then the manifesto. Each key that does the same shows beside it, where there is a keyboard. A language or a theme picked there applies at once and the menu stays, the drawer open beside the conversation staying so (D153, D165).

### How Jean's presence shows state

| State | Light behaviour | The little light |
|---|---|---|
| Idle | Slow ambient breathing | Sways and breathes, blinks now and then |
| Listening (the user types or speaks) | Light leans toward the input | Looks down at the box, glows brighter |
| Thinking | A subtle flicker | Looks up and from side to side; sparks rise from its tip |
| Working | Light sweeps over the item being worked on (the file being read glows) | As when thinking |
| Answering | Warms and widens | Bobs while the answer streams in, at its brightest |
| Waiting for approval | Steady warm pulse on the approval card | Its glow pulses; its eyes turn to the card |
| Done | Settles | Happy closed eyes and a little hop, then idle |
| Something went wrong | — | Dims and droops, with a small sorry face, until the next message |

### The little light

Jean's persona is the room's light, drawn small: a soft flame with a curled tip, a warm inner glow, two round eyes, rosy cheeks and a small smile. It is one inline SVG in `ui/persona.js` (`<app-persona>`, about 1 KB), and CSS does all of its moving: it reads `data-presence`, which mirrors `app.presence`, plus "waiting" while an approval is open and "oops" after an error.

- **Where it lives.** Above the question on the first screen, at the room's light. When the conversation begins it flies into the header beside the wordmark (a view transition), and stays there showing the state.
- **By night and by day.** The same colours in both. By day it is drawn in ink (a `--flame-deep` rim) on paper, like the rest of the light mode; with `prefers-contrast: more` the rim is the ink colour.
- **At every size.** From about 7 rem down to a 1.5 rem favicon-sized flame; below 2.6 rem the cheeks and the eye highlights drop out (a container query).
- **It has no words and no gender.** It never speaks, never carries text, and nothing in the interface agrees with it grammatically. It is not tied to the name either, so it survives a rename.
- **It is not in the prompt.** The base prompt stays free of personas (AGENTS.md); the little light is purely visual and decorative (`aria-hidden`).
- **A project's light tints it.** Every colour of the little light comes from one custom property, `--tint`: Jean's amber by default, any CSS colour otherwise. Only the hue is taken, so the face keeps its contrast whatever the colour. Projects (0.4) set it from the `colour` in `project.md`: on the root for the room you are in, or on one `<app-persona>` (a project's card in the house).
- **It is the app icon.** `icons/icon.svg` is the same drawing, idle, in the dark room, inside the maskable safe zone. `npm run icons` draws it as the PNGs that Android and iOS install with (D131).

## Looks

The room is Jean's own look, and the default. Settings → Appearance offers two more, each in light and dark (D111):

- **Room:** everything above. A dark, warm room lit by the little light, the display face, and the room warming with each discovery.
- **Mail:** after the devs.new task inbox. Conversations sit in a list beside the one open, as in an email client: wider than a phone, one sidebar, as in the Claude apps, with the name at its top, the list, and the user at its foot, whose menu holds Settings (D117, D150), open until the user puts it away (D165); on a phone, the room's layout with the list in its drawer. Neutral greys, one blue accent, the system face, flat surfaces. The little light stays at the name.
- **Paper:** ink on paper. A serif for everything, a rule under the masthead, the user's words set as a quotation in the margin's red, square corners, no glow.

**Make it yours** adds an accent colour, a background colour, a text size, a typeface (sans-serif, serif, rounded or typewriter) and the user's own CSS, over any look, shown as they change. A picked colour keeps its hue and some of its chroma, at the lightness each mode needs for contrast, so text stays readable by day and by night. The accent also colours the little light and the room's glow, unless a project has a light of its own.

## Typography

- **One expressive display face** for the name and big statements: OFL-licensed, Latin subset, ≤ 30 KB. Instrument Serif ships for now (D34); Fraunces will probably replace it, as a static instance (see [open-questions.md](open-questions.md)).
- **The system UI font for everything else.** It covers every script with zero bytes, so there's no 10 MB CJK font.
- **The wordmark is `BRAND.name` set in the display face,** so it survives a rename.
- **Big editorial type at the start.** The first question is huge and shrinks into place once the conversation begins.

## Techniques (pure CSS)

- **Colour:** oklch colours with `color-mix()` and `light-dark()`
- **Light:** `@property`-animated custom properties for the light (gradients, warmth, intensity)
- **Transitions:**
  - View Transitions for unlocks and project switches
  - `@starting-style` for entry animations
  - `:not(:defined)` for undiscovered custom elements, which animate in when their module loads
- **Layout:**
  - `:has()` and container queries
  - Logical properties only, so right-to-left layouts are free
- **What it doesn't use:** no canvas, no images, no animation library and no icon pack. There are about 20 inline SVG icons, and one inline SVG character.

## Accessibility

- **WCAG AA contrast at every stage.** "Dark" applies to ambient surfaces only; text is always high-contrast.
- **`prefers-reduced-motion`:** a still glow, with no movement. The little light keeps its poses (where it looks, happy or sorry eyes), so each state still reads.
- **`prefers-contrast: more`:** stronger borders and flat surfaces.
- **`forced-colors`** is supported. The little light becomes an outline drawing in the system colours.
- **Keyboard:** fully navigable, with focus that is always visible. ⌘, opens Settings, ⌘N a new conversation, ⌘⇧L switches between light and dark, ⌘K opens search once it is found and ⌘⇧B the browser, Ctrl outside Apple's systems (D118, D130, D133, D142).

## Budget

| Item | Limit |
|---|---|
| CSS | ≤ 12 KB gzipped for the room; another look adds its own file only when chosen |
| Display font | ≤ 30 KB |
| Images | 0 |
| Icons | ~20 inline SVGs |
| Persona | One inline SVG, animated with CSS only |
