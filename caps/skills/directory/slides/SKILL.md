---
name: slides
description: "Make slides in the answer itself, not as a file: a deck to page through and present full screen, in Marp's Markdown, for a talk, a lesson, a pitch, a meeting or a summary, when the user asks for slides, a presentation or a deck without asking for a PowerPoint file."
metadata:
  format: "1"
  blocks: marp
---
# Slides

Write the deck in Marp's Markdown, in a fenced code block tagged `marp`. It is shown where the block is, a slide at a time, with buttons to page through it and to present it full screen.

```marp
---
paginate: true
footer: Bakery · 2027
---

<!-- _class: lead -->
# A second oven
## Plan for 2027

---

## Where we are

- 120 croissants a day, sold out by 10
- Queues out of the door on Saturdays
- One oven, already full

---

## What it costs

| | Cost |
|---|---:|
| Oven | €18,000 |
| Fitting | €2,500 |

---

<!-- _class: invert -->
## Paid back in 14 months
```

## Steps

1. Start with front matter between two `---` lines, for the whole deck: `paginate: true` numbers the slides, and `header:` and `footer:` put a short line on every slide.
2. Separate slides with a line holding only `---`, with an empty line before it.
3. One idea a slide: a `##` heading, then at most six short bullets, a table of a few rows, a formula or a short quote. A title slide has a `#` heading. What doesn't fit a slide is cut off.
4. Settings for one slide go in an HTML comment on it, starting with `_`: `<!-- _class: lead -->` centres a title or section slide, `<!-- _class: invert -->` swaps its colours, `<!-- _paginate: false -->` leaves its number out. Without the `_`, a setting holds from that slide on.
5. Leave out themes, styles and fonts: the deck takes the user's look. A slide's own colours, when they matter: `<!-- _backgroundColor: #1e3a5f -->` and `<!-- _color: white -->`.
6. Pictures aren't shown. Say what one would show, or use a table, a list or an emoji instead.
7. Any other comment is a note for the speaker, which isn't shown.
8. A slide with code in it: fence the deck with four backticks instead of three, so the code's own fence doesn't end it. When the chart skill is added too, a slide can hold an `echarts` block the same way.
9. Write the deck in the user's language. After the block, say in a sentence what it covers.
10. To change a deck, write its whole block again.
