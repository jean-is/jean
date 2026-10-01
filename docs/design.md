# Design

Minimal stack, epic result. The style has to be memorable enough that people retell it.

## Concept: the room lights up

A nod to *A Dark Room*. **Jean is the light source, not an object on screen.** Its presence is felt in how the room is lit.

- **First visit.** A dark, warm room, and one line of very large type: the question. Nothing else.
- **Discovery lights the house.** Each discovered capability "catches the light": its surface warms in from the shadow, and the palette warms a step. When everything has been discovered, the house is in full daylight. People feel their progress instead of counting it.
- **Each project is a room** with its own light colour. Switching project feels like walking into another room, with the ambient light cross-fading.
- **The collection page is the house.** Discovered rooms and capabilities are lit; the rest are silhouettes in shadow.
- **Light mode tells the same story by day,** with paper and ink: progression shows as warmth and ink density.

### How Jean's presence shows state

| State | Light behaviour |
|---|---|
| Idle | Slow ambient breathing |
| Listening (the user types or speaks) | Light leans toward the input |
| Thinking | A subtle flicker |
| Working | Light sweeps over the item being worked on (the file being read glows) |
| Waiting for approval | Steady warm pulse on the approval card |
| Done | Settles |

**Caution:** don't embody Jean as a single glowing orb. OpenAI's Dots (2026) make that read as derivative. The environment carries the presence.

## Typography

- **One expressive display face** for the name and big statements. Variable, OFL-licensed, Latin subset ≤ 30 KB. The choice is still open (see [open-questions.md](open-questions.md)).
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
- **What it doesn't use:** no canvas, no images, no animation library and no icon pack. There are about 20 inline SVG icons.

## Accessibility

- **WCAG AA contrast at every stage.** "Dark" applies to ambient surfaces only; text is always high-contrast.
- **`prefers-reduced-motion`:** a still glow, with no movement.
- **`prefers-contrast: more`:** stronger borders and flat surfaces.
- **`forced-colors`** is supported.
- **Keyboard:** fully navigable, with focus that is always visible.

## Budget

| Item | Limit |
|---|---|
| CSS | ≤ 12 KB gzipped |
| Display font | ≤ 30 KB |
| Images | 0 |
| Icons | ~20 inline SVGs |
