# Kinds of site

Each kind's pages, then its parts in order. Leave out a part the request gives nothing for, rather than filling it with invented words.

## landing

A product, an app, a service or a waitlist. One page.

1. Header: the name, and a link to the form ("Join the waitlist").
2. The promise: an h1 saying what it does for whom in ten words or fewer, one sentence on the gain, the call to action as a link styled as a button, and a drawing in SVG or a shared picture.
3. Why: three short points, each a gain for the visitor, not a feature.
4. How it works: three steps, in an `<ol>`.
5. A demo where it helps: a small calculator worked out in the page by `site.js` (what it saves, what it costs), its fields labelled, its result in an `<output>`. The script works the result out from the fields when the page loads and at each change, reading decimals as the page's language writes them; no result is typed in the page.
6. Prices only if the request gives them.
7. Questions: three to five, each a `<details>` with its `<summary>`.
8. The form again at the end: an email field only, for a waitlist, with its line on what the address is for.
9. Footer: the name, a way to reach them if given, the year.

## portfolio

A photographer, a designer, an illustrator, an architect. One to three pages: the work (`index.html`), about, contact.

1. The promise: their name and what they do, in one sentence.
2. The work: the shared pictures in a grid, each a `<figure>` whose `<figcaption>` gives a title, and a place or client only if given. Each `alt` says what the picture shows. A picture opens large through a plain link to its file; no script.
3. About: a short paragraph in the first person, with placeholders for what isn't given; what they offer as a short list.
4. Contact: a form (name, email, message), and placeholders for their profiles elsewhere.

## business

A bakery, a café, a repair shop, a salon, a practice. Two to four pages: home, what they sell, visit, and an order or contact page if asked for.

1. The promise: the name, what and where in one line, then the opening hours and a way to call or come (a `tel:` link only with a given number).
2. What they sell: the given items, with prices only as given; prices in a `<table>` with a `<caption>` and `<th scope>`, inside a wrapper that scrolls on its own on a phone.
3. Visit: the address in `<address>`, the hours in a `<table>` or a `<dl>`, how to get there; no map inside the page, but a link that opens the address in a map service, only with a given address.
4. Order or contact: a form for what the request names (a cake: name, email, the date it is for, what they would like).

## event

A wedding, a conference, a party, a fundraiser. One or two pages.

1. The promise: what, when (the date as the language writes it, in `<time datetime>`), and where.
2. The plan of the day: times and moments in an `<ol>`, each time in `<time>`.
3. Getting there and where to stay: the places given, placeholders otherwise.
4. The reply: a form with a name, coming or not as radio buttons in a `<fieldset>` with its `<legend>`, how many, a message, and the date to reply by.
5. Questions: what to wear, children, gifts, only what the request gives.

## personal

A CV, a personal page, a club. One page.

1. The promise: the name, what they do, the city only, and a way to reach them.
2. For a CV: experience newest first, each with its dates in `<time>`, its role, its place and two lines of what they did; then education, skills as a short list, and languages. Everything from the shared file, nothing added.
3. Contact: an email link or a form; never a home address or a date of birth.
