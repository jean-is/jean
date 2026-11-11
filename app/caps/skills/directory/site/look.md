# The look

Plain CSS in `style.css`, coloured and set only through the properties of `look.css`. That file is written for you from `look` (and linked from every page, if you don't): never write it, and never a colour anywhere else, no `#hex`, `rgb()` or colour name, not even in a drawing. By night it changes the properties itself, so write no dark mode of your own. The user sees the site in three looks, yours (or their project's) first, and picks one: every page follows.

- `look`, in `site`: an accent as `#rrggbb` for the subject and its audience, a pale `paper` only if it matters, and a `type`: `calm`, `friendly`, `elegant`, `bold` or `handwritten`. The user's colours when they give some. To change the colours later (warmer, darker, their brand's), give `look` to `site_change`, and nothing else.
- Grounds: `var(--paper)`, and `var(--tint)` for every other section.
- Words: `var(--ink)`, and `var(--quiet)` for what matters less. Both read on the paper and the tint.
- Links, buttons and what stands out: `var(--accent)`; words on it, `var(--on-accent)`. A second accent for drawings and details: `var(--accent-2)`.
- Type: `var(--font)` for words, `var(--display)` with `font-weight: var(--display-weight)` for headings. System fonts only, nothing downloaded.
- A softer shade, a line or a shadow: `color-mix(in srgb, var(--accent) 15%, var(--paper))`.

```css
:root { --wide: 68rem; --gap: clamp(1rem, 4vw, 2.5rem); }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; min-block-size: 100dvh; display: flex; flex-direction: column; font: 1.0625rem/1.6 var(--font); color: var(--ink); background: var(--paper); }
h1, h2, h3 { font-family: var(--display); font-weight: var(--display-weight); }
main { flex: 1; }
img, svg { max-inline-size: 100%; block-size: auto; }
.wrap { max-inline-size: var(--wide); margin-inline: auto; padding-inline: var(--gap); }
section { padding-block: clamp(2.5rem, 8vw, 5rem); }
h1 { font-size: clamp(2rem, 7vw, 3.5rem); line-height: 1.1; }
h2 { font-size: clamp(1.5rem, 5vw, 2.25rem); line-height: 1.2; }
h1, h2, h3 { overflow-wrap: break-word; text-wrap: balance; word-break: auto-phrase; }
p, li { max-inline-size: 65ch; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.button { display: inline-block; padding: 0.75rem 1.25rem; border-radius: 0.5rem; background: var(--accent); color: var(--on-accent); font-weight: 600; text-decoration: none; }
.grid { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
.hero .wrap { display: grid; gap: var(--gap); align-items: center; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); }
.hero svg, .hero img { inline-size: 100%; max-inline-size: 30rem; justify-self: center; }
.tint { background: var(--tint); }
header .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding-block: 1rem; }
nav ul { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 0; padding: 0; list-style: none; }
form { display: grid; gap: 1rem; max-inline-size: 32rem; }
label { font-weight: 600; }
input, textarea, select { inline-size: 100%; padding: 0.625rem; border: 1px solid var(--quiet); border-radius: 0.375rem; font: inherit; color: var(--ink); background: var(--paper); }
.scroll { overflow-x: auto; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
```

- Contrast holds as long as words in `--ink`, `--quiet`, `--accent` or `--accent-2` sit on `--paper` or `--tint`, and words in `--on-accent` on `--accent` or `--accent-2`.
- Sizes in `rem`; widths through `min()`, `max-inline-size` and grids with `auto-fit` and `minmax`, never a fixed width in pixels. At 320 pixels wide nothing is cut and nothing scrolls sideways: a wide table goes in `.scroll`.
- Logical properties only: inline and block, start and end; never `left`, `right`, `margin-left` or `text-align: left`.
- The first screen carries the site: the promise in a `<section class="hero">`, its words in one column and a drawing or the user's best picture filling the other, centred, as wide as its column. A drawing is a small scene in inline SVG, made of several shapes in the site's colours, `fill="var(--accent)"` and the like (a shop front, a table set, a phone showing the app), never one small icon alone in empty space; `aria-hidden="true"` when it only decorates, or `role="img"` with an `aria-label` when it says something.
- Sections alternate the paper and the tint (`class="tint"`), each with enough to say: a section of one line or a lone button joins its neighbour. Groups of three or more go in a `.grid` of cards; nothing sits alone on one side of a wide screen.
- The foot stays at the bottom of a short page (the body's column above does it), with nothing below it.
- No motion needed, and none under reduced motion.

## A page

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atelier Nord · Bike repairs</title>
<meta name="description" content="Bike repairs and servicing while you wait, with honest prices and spare parts for every kind of bike.">
<meta property="og:title" content="Atelier Nord · Bike repairs">
<meta property="og:description" content="Bike repairs and servicing while you wait, with honest prices.">
<meta property="og:type" content="website">
<link rel="stylesheet" href="look.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header><div class="wrap">
  <a href="index.html" class="name">Atelier Nord</a>
  <nav aria-label="Main"><ul>
    <li><a href="index.html" aria-current="page">Home</a></li>
    <li><a href="prices.html">Prices</a></li>
    <li><a href="visit.html">Visit</a></li>
  </ul></nav>
</div></header>
<main>
  <section class="hero"><div class="wrap">
    <div>
      <h1>Your bike, fixed while you wait</h1>
      <p>Bring it in before noon and ride home the same day.</p>
      <a class="button" href="visit.html">Find the workshop</a>
    </div>
    <svg viewBox="0 0 400 300" aria-hidden="true">
      <rect width="400" height="300" rx="24" fill="var(--tint)"/>
      <circle cx="120" cy="200" r="56" fill="none" stroke="var(--ink)" stroke-width="10"/>
      <circle cx="290" cy="200" r="56" fill="none" stroke="var(--ink)" stroke-width="10"/>
      <path d="M120 200 L180 120 L260 120 L290 200 M180 120 L215 200 L260 120 M170 104 h30 M250 96 l20 24" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div></section>
  <section class="tint"><div class="wrap">…</div></section>
</main>
<footer><div class="wrap"><p>Atelier Nord · [your address] · [your phone number]</p></div></footer>
</body>
</html>
```
