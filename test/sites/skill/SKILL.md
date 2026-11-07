---
name: site
description: "Make a website of a few pages, a landing page, a portfolio, a shop's, an event's or a CV, checked on phones, for screen readers and for search engines before it is shown."
metadata:
  format: "1"
  title-en: "Make a site"
  text-en: "Websites of a few pages, checked and ready to put online"
  title-fr: "Faire un site"
  text-fr: "Des sites de quelques pages, vérifiés et prêts à mettre en ligne"
  title-ar: "اصنع موقعًا"
  text-ar: "مواقع من بضع صفحات، مفحوصة وجاهزة للنشر"
  title-ja: "サイトを作る"
  text-ja: "数ページのウェブサイトを、確認済みで公開できる形に"
---
# Make a site

Make the site with `site`, read the check it returns, fix what it says, and only then hand it over. Decide whatever the request leaves open and keep going: a first site that passes is worth more than a question. A site is never a ```html page in your answer nor a file written with `write`: only `site` keeps it, checks it and lets it be published.

## Steps

1. Take what the request gives: who the site is for, the one thing a visitor should do (sign up, buy, call, order, come, hire, write), the facts (names, hours, places, prices, dates), the files and pictures shared, and the languages. Read a shared file before writing: its facts go in the site, not yours.
2. Never invent what a visitor would act on or rely on: an address, a phone number, an email, a price, an hour, a date, a name, a review, a client, a figure. Where one is missing, write a short placeholder in square brackets in the page's language, such as [your phone number], and list them when you hand the site over. Never claim what the request doesn't say about them either: their qualities, size, years, awards or numbers ("small classes", "since 1998", "the best in town"); say what they do, not how good it is. Say each given fact exactly, and never stretch it, in a headline least of all: bread "every day" is wrong when they close on Mondays. The pages speak to visitors only: never a word to the site's owner on them ("replace this", "add your photo here"), just the short placeholders.
3. Pick the kind and read its part of `site/kinds.md`: landing, portfolio, business, event or personal. Then read `site/look.md` before writing any code.
4. Plan one to five pages, each with one job; a landing page or a CV is one page. Name files in plain lowercase words: `index.html` first, then `menu.html`, `contact.html`. Every page shares one `style.css`.
5. Write plain HTML and CSS, as `site/look.md` shows. A script only for what they can't do, in `site.js`, never inside the page; a menu needs none. No framework, no library, and nothing loaded from another site: no fonts, scripts, styles, pictures, maps or videos from elsewhere. Links out are fine. Pictures are the user's shared files, named with `from`, or drawings you write as SVG; never a picture from the internet.
6. Every page has `<!doctype html>`, `<html lang dir>`, `<meta charset="utf-8">`, the viewport line, a `<title>` of 60 characters at most and a `<meta name="description">` of 50 to 160, each the site's only one; `og:title`, `og:description` and `og:type`; one `<header>` with the site's name and a `<nav aria-label>`, one `<main>` with one `<h1>`, and one `<footer>`. Headings never skip a level. The page's own link in the nav has `aria-current="page"`.
7. Words in the user's language unless they ask for others: short sentences, the visitor's gain first, one call to action per page, said again at its end. Dates, numbers and prices as that language writes them.
8. Several languages: the first language's pages at the top, each other language's in a folder named by its code, with the same files (`index.html`, `fr/index.html`). Each page names every version with `<link rel="alternate" hreflang>`, itself among them, and the header has a switch whose links name each language in its own words, with `lang` and `hreflang`. A right-to-left language takes `dir="rtl"`. The CSS uses logical properties only (`margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align: start`), so it reads both ways with nothing added.
9. Pictures: an `alt` saying what matters in them, or `alt=""` when they only decorate; `width` and `height`; `loading="lazy"` below the first screen. Every word a visitor must read is text, never inside a picture.
10. Forms: `<form method="post" data-form="name">` with no `action`: the site's host receives what is sent. A `<label for>` for every field, `autocomplete`, the right `type` (`email`, `tel`, `date`), `required` where it is. Never a field for a password, a card number or an identity number. Beside the button, one line saying who receives what is sent, and what for.
11. Call `site` with every file. Read its report: each problem names the page and what to change. Fix with `site_change` for a few passages, or `site` again with the site's place for many. After three rounds without a clean report, make the site smaller, not larger.
12. Hand it over in three short lines: the pages and what each is for; what is left to fill in (the bracketed placeholders), if anything; three ideas to grow it the user can ask for in their own words. Don't end with a question.
13. To change a site later, use `site_change` with the smallest passages, and keep every page saying the same in each language.

## What a site can't do

A site is pages people read and forms that reach its owner. It has no accounts, no sign-in, no payments, no bookings and no database. Asked for a SaaS, a shop, a member area or bookings, say so in one plain sentence, then make what serves the goal now: the product's site with a waitlist, a page on how it works, a calculator worked out in the page; for payments or bookings, a link to the service the user already uses. Never draw a sign-in page or a checkout that does nothing. A product not built yet is told as coming: what it will do, and the waitlist to hear when it opens; never as if accounts or features worked today.

In a child's profile: no full name, school, address, phone number or picture of the child, and no form.

## What the check reads

Each report says what a visitor with a phone, a screen reader or a search engine would meet on each page: its language and direction, one h1 and headings in order, names for links, buttons, fields and pictures, the title, the description and the card, links that lead somewhere, every page reached from the first, each language with every page, nothing loaded from elsewhere and no script inside a page, no password or card field, a sideways scroll at 320 pixels, pictures that don't load, a script's errors, and colours whose contrast is too low. It also lists the placeholders left to fill in.
