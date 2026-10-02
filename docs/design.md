# Design

Minimal stack, epic result. The style has to be memorable enough that people retell it.

## Concept: the room lights up

A nod to *A Dark Room*. **Jean is the light source.** Its presence is felt in how the room is lit, and when you look at the light, it looks back: a little flame with a face (see [The little light](#the-little-light)).

- **First visit.** A dark, warm room, the little light, and one line of very large type: the question. Nothing else.
- **Discovery lights the house.** Each discovered capability "catches the light": its surface warms in from the shadow, and the palette warms a step. When everything has been discovered, the house is in full daylight. People feel their progress instead of counting it.
- **Each project is a room** with its own light colour. Switching project feels like walking into another room, with the ambient light cross-fading.
- **The collection page is the house.** Discovered rooms and capabilities are lit; the rest are silhouettes in shadow.
- **Light mode tells the same story by day,** with paper and ink: progression shows as warmth and ink density.

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
- **A project's light could tint it** (each project is a room with its own light colour), by overriding its colours.

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
- **Keyboard:** fully navigable, with focus that is always visible.

## Budget

| Item | Limit |
|---|---|
| CSS | ≤ 12 KB gzipped |
| Display font | ≤ 30 KB |
| Images | 0 |
| Icons | ~20 inline SVGs |
| Persona | One inline SVG, animated with CSS only |
