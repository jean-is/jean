# Shapes of a prototype

Take the shape that fits, then add only what the request asks for.

## A phone app

- A column `max-inline-size: 26rem; margin-inline: auto`, full height, on the paper; at 1280 pixels it stays a column, centred.
- A top bar: the screen's name as the `<h1>`, and a link back (`←` hidden from screen readers, "Back" as its name) wherever the screen isn't one of the tabs.
- Tabs at the foot, three to five: a `<nav aria-label="…">` of links, each a small drawing in inline SVG (`aria-hidden="true"`) over a word, the current one with `aria-current="page"`.
- Lists of things to pick (services, people, tools, times) as links to the next screen carrying the choice: `<a href="time.html?service=cut">`. A time or a date to pick: radios in a form whose `action` is the next screen.
- A message thread: messages in a list, each with who and when; a field and a Send button that adds the message to the list with `prototype.js`, saying under it that the real app would send it.

## The steps of a form

- One step per screen: "Step 2 of 4" as a line above the `<h1>`, the fields of that step only, Back as a link and Continue as the form's button, its `action` the next step.
- The last step shows what was entered (read from the address by `prototype.js`) before the person confirms; the screen after says what happens next, and when.
- A choice that changes the path (yes or no, a kind of request) sends the form to one screen or another: `prototype.js` sets the form's `action` from the choice when it changes.
- Someone else's part (a manager who approves, a teacher who replies) is its own screen, reached from a link such as "See it as the manager", so both sides of the flow show.

## A dashboard

- The name and the period at the top, then the figures that matter as cards (a `<dl>` each: the label, the figure, the change), then a table or a list.
- Each row leads down one level, carrying where it came from: `region.html?region=north`, then `shop.html?region=north&shop=lyon`. A breadcrumb `<nav aria-label="…">` leads back up.
- A chart as inline SVG drawn from the sample figures, `role="img"` with an `aria-label` that says them; the same figures in a table under it for whoever can't see it.
- A control that changes the figures (a month, a region) is a `<select>` or radios whose change `prototype.js` follows, writing the new figures and carrying the choice in every link.
- Wide tables go in `<div class="scroll">` (`overflow-x: auto`), so nothing scrolls sideways at 390 pixels.

## prototype.js

```js
// What earlier screens chose, from the address: <span data-given="time">10:30</span> shows the time picked, or its own words.
const given = new URLSearchParams(location.search)
for (const element of document.querySelectorAll('[data-given]')) element.textContent = given.get(element.dataset.given) || element.textContent
// Links that carry every choice so far along: <a data-carry href="confirm.html">
for (const link of document.querySelectorAll('a[data-carry]')) {
  const url = new URL(link.getAttribute('href'), location.href)
  for (const [key, value] of given) if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  link.href = url.pathname.split('/').pop() + url.search
}
// A button that opens a panel: <button type="button" aria-expanded="false" aria-controls="filters">
for (const button of document.querySelectorAll('button[aria-controls]')) button.addEventListener('click', () => {
  const open = button.getAttribute('aria-expanded') !== 'true'
  button.setAttribute('aria-expanded', String(open))
  document.getElementById(button.getAttribute('aria-controls')).hidden = !open
})
```
