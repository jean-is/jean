---
name: prototype
description: "Make a clickable prototype of an app or a flow: a few screens a person clicks through to show an idea, checked on a phone and a computer before it is shown."
metadata:
  format: "1"
  title-en: "Make a prototype"
  text-en: "Screens of an app idea to click through and show"
---
# Make a prototype

A prototype shows an idea for an app, a form or a service: a few screens, each its own page, that a person clicks through as if it worked. Make it with `prototype`, read the check it returns, fix what it says, and only then hand it over. Don't ask first: decide what the request leaves open and say so in one line. A prototype is never a ```html page in your answer nor a file written with `write`: only `prototype` keeps it and checks it.

## Steps

1. Take what the request gives: who uses it, the path they follow from the first screen to the last, the facts (names, services, prices, dates), the files shared, and the language.
2. List the screens, three to eight, each with one job, in the order a person meets them: `index.html` first, the others in plain lowercase words (`time.html`, `confirm.html`). Then read `prototype/screens` (with `skill`) for the shape that fits: a phone app, the steps of a form, or a dashboard.
3. Every screen is reached from the first, and every control does something a person sees: a link or a button leads to another screen, or changes this one (opens a panel, switches a tab, picks a time, adds a line). Never a button that does nothing, never `href="#"`. A choice a later screen shows travels in the address: a link such as `confirm.html?time=10:30`, or a form whose `action` is the next screen, its fields going along; `prototype.js` reads them with `URLSearchParams`. Nothing is kept anywhere else: no `localStorage`, no cookies.
4. It looks real and doesn't pretend: real words in the user's language, sample names and figures that fit the subject, never lorem ipsum, and one small line on the first screen saying it is a prototype with sample data. Where a real app would sign in or take a payment, show what the person would see with no field for a password, a card or a bank number: a "Continue as Sara" button, or the card written as words ("Visa ending 4242, sample") above a "Pay €29 (demo)" button that leads to the next screen. Where it would send something, say what the real app would do ("The teacher would get this message").
5. Read `site/look` (with `skill`) for colours and type: everything through the properties of `look.css`, which `prototype` writes from its `look`, never a colour of your own. One `style.css` for every screen.
6. Each screen has `<!doctype html>`, `<html lang dir>`, `<meta charset="utf-8">`, the viewport line, a `<title>` naming the prototype and the screen, `look.css` then `style.css`, one `<main>` with one `<h1>`, and headings in order. A way back wherever a person would look for one. Links go to another screen, `<button type="button">` stays on this one. Every field has a `<label for>`; every picture an `alt`, or `alt=""` when it only decorates.
7. A script only in `prototype.js`, linked from each screen that needs it with `<script src="prototype.js" defer></script>`, never inside a page and never `onclick=""`. No `alert()`, `confirm()` or `prompt()`, which Jean's frame doesn't show: write the message on the screen. No framework, no library, nothing loaded from another site.
8. A phone first, a computer too: at 390 pixels nothing scrolls sideways or is cut, at 1280 nothing stretches thin. A phone app keeps a centred column; a dashboard uses the width. Sizes in `rem`, logical properties only (`margin-inline-start`, `text-align: start`), so a right-to-left language reads with nothing added.
9. Call `prototype` with every file. Its check opens each screen at 390 and 1280 pixels, presses every control, and says which screens nobody reaches, which controls do nothing, and what a screen reader would miss. Fix with `prototype_change` for a few passages, or `prototype` again with its place for many. After three rounds without a clean report, make it smaller, not larger.
10. Hand it over in three short lines: the screens in order and what each shows; what is sample; three ideas to take it further, in words the user could ask with. Don't end with a question.
11. To change it later, use `prototype_change` with the smallest passages, and keep every link and every screen's words right.

## What a prototype isn't

A prototype shows; it keeps nothing, sends nothing and takes no money. Its screens never ask for a password, a card or an identity number, and never say something was sent, saved or paid as if it were. When the request needs pages for strangers to read and find, that is a site.
