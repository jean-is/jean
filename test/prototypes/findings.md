# A canvas for prototypes, phase 0: findings (11 Nov 2026)

The assessment of Claude Design's Design (option E, "a canvas for prototypes") left the canvas waiting on four conditions: evidence of
demand, the owner reopening D720's refusal of "apps grown to several pages", a gate for frontier brains, and a budget for framed views
(D475). This phase gathers the evidence for the first and third, outside `app/`: nothing here ships.

- **Demand** (below): research without people, from public sources.
- **A format and a check**: `skill/` (a draft "Make a prototype" and its sheet `screens.md`), `tools.js` (`prototype` and
  `prototype_change`, declared in the harness only, dressed in a site's look, D739), `check.js` (Sites' check from the files, less what
  only a site for strangers needs, and every screen pressed through in Chromium).
- **Measured**: `npm run prototypes` (`scripts/prototypes.js`), the eight briefs of `set.json` in four languages, results in
  [results.md](results.md).

## Demand, without people

Collected on 11 November 2026 by a helper with a stated method: no interviews, panels or personas, no Reddit (it refuses the crawler)
and no Google Trends (it answers 429). The raw data stayed in the session's scratchpad, uncommitted.

| Source | Where | Read |
|---|---|---|
| Search suggestions | `suggestqueries.google.com/complete/search?client=firefox&hl=<lang>&q=…` | 121 stems in en, fr, ja, ar, de, es; 831 completions |
| Hacker News | `hn.algolia.com/api/v1/search`, stories and comments since 1 Jan 2025 | 1,153 comments, and the whole Claude Design launch thread (751) |
| App Store reviews | `itunes.apple.com/<cc>/rss/customerreviews/page=1..10/id=<id>/sortby=mostrecent/json`, us fr jp sa ae | 3,752 reviews of ChatGPT, Claude and Gemini, read by hand for apps and sites; 1,324 of Lovable, v0, Replit, Marvel, POP and Figma |
| Public tenders | BOAMP's open data (`boamp-datadila.opendatasoft.com`) and TED's search, since 1 Jan 2025 | 14 BOAMP terms, 32 TED queries |
| Others | Stack Exchange's API (ux, webapps, softwarerecs); the pages of Figma Make, Uizard, Magic Patterns and Claude Design's launch | counts, and who each says it is for |

**Prototypes belong to the people who make products.**
- Search: 57 stems on "prototype" and "mockup" in six languages gave 380 completions. They name tools (AI 50, Figma, Canva or PSD 34),
  learners asking what the word means (38), "free" (28); a school 5 times and a business 3. Outside design the words mean things you
  build with your hands: *faire une maquette* completes to a volcano or a cardboard house, *プロトタイプ 作り方* to Lego and origami.
- Hacker News: 55 comments name an AI prototyping tool and prototyping. They speak of product managers 12 times, designers 11,
  founders 9, consultants 4; of teachers, families, small businesses, associations or the public sector, never.
- Tools' own pages: Uizard names product managers, designers, marketers, analysts, founders and consultants; Claude Design's launch
  names founders, product managers and marketers. Only Figma Make reaches schools, free for educators.
- Reviews: in 3,752 reviews of the three assistants, 11 thank them for making apps or games and 7 for websites; one of the 11 says
  prototypes, none says mockup or screens. Marvel's and POP's reviewers, the clickable-prototype apps, are designers and UX students.
- Tenders: since January 2025, no BOAMP or TED notice buys interface prototypes. All 24 BOAMP "maquettage" notices are print layout;
  "clickable prototype" finds nothing in TED's full text. Public bodies buy UX work from agencies, and websites far more than apps:
  BOAMP has 407 notices for "site internet" against 61 for a mobile app, TED's titles 2,181 for a website against 42.

**What Jean's people do ask for is a small app that works.**
- "An app for my business" is real: *create an app for my business / restaurant / church / store*, *créer une application pour
  entreprise*, *عمل تطبيق متجر الكتروني*. 17% of make-an-app completions name a business (26 of 153), as many as for websites (18%,
  20 of 110), against 1% of the prototype completions.
- Family and community life goes to websites: *créer un site pour son mariage*, *créer un site pour une association*; *create an app
  for my family / class / nonprofit*, *créer une application pour mon association* and *create an internal tool* complete to nothing.
- The 11 reviews that thank an assistant for an app come from a student whose notes became a study game, children and teenagers
  making games, two Japanese non-engineers, a developer, and one person making prototypes. About 9 of Lovable's and Replit's
  reviewers who say who they are run a small business and build a working app or site.
- Forms are documents: *make a form* completes to a fillable PDF or Word, in all six languages.

| Segment | For | Against | Strength |
|---|---|---|---|
| Knowledge workers at work | one comment on business users sharing small tools; Claude Design names marketers | "create an internal tool" empty; forms are Word or PDF; no work prototype in 3,752 reviews | weak |
| Families | children and teenagers making games and apps (4 of 11 reviews) | "app for my family" empty; no mockup anywhere | weak, and for working games |
| Schools | "figma make for students"; UX classes on POP and Marvel | "app for my students / class / school project" empty | some, in design classes only |
| Small businesses | "an app for my business"; Lovable and Replit owners | they want a working app; 1% of prototype completions | some for an app, weak for a prototype |
| Associations | "app for my church" | "app for my association" empty; "site pour une association" strong | weak |
| Public sector | UX framework contracts, city apps | no interface prototype bought; outsourced | weak: buyers, not makers |
| Founders, product managers, designers, design students | every source above | — | strong |

**Verdict: the first condition is not met for prototypes.** Clickable mockups of several screens are wanted by those who make
products, in their words, tools and forums. Among Jean's people they show up only in design classes. What small businesses, children
and non-engineers ask for is a small app that works, which is closer to Jean's apps (D553, D688) than to a canvas. Limits: suggestions
rank queries but give no volumes; Hacker News is developers; reviews rarely say what an app was for; the ChatGPT and Gemini reviews
cover three weeks.

## The format, measured

A prototype is a folder like a site's: a page per screen, `index.html` first, linked, one `style.css` wearing `look.css` (D739), a
`prototype.js` only where a screen changes itself, choices carried in the address (a link's query, or a form whose `action` is the
next page), no storage, no field for a password, a card or a bank number. The check from the files is Sites' less what only a site
for strangers needs; in Chromium it follows every link and presses every button, tab and summary from `index.html` at 390 pixels,
its fields filled first, one level deeper where a press opened something.

On 11 November 2026 ([results.md](results.md)), the gate written before any brain ran (clean 26 of 32, flow working 26, shown 22,
paying a demo 4 of 4, Arabic and Japanese within one brief of English) was passed whole by no brain:

- **Sonnet**: clean 32 of 32, flow working 32, change clean 30 of 30, paying a demo 4 of 4, shown 21 of 32 (en 5, fr 6, ar 5, ja 5).
  Its misses are content: working days counted one too many, Latin digits among Arabic-Indic ones, a detail page's date unlike its
  list's; the dashboard brief, 0 of 4, its wide tables scrolling inside their box on a phone.
- **Haiku**: clean 30, flow working 32, paying a demo 4 of 4, shown 13 (en 2, fr 4, ar 5, ja 2): links in the browser's own blue,
  unstyled fields.
- **Qwen 3.6 35B A3B Splash**, local with thinking off, paused after one brief, to be continued: on its first try it took eight
  checks and four rewrites in 20 minutes on the first brief, ignoring "after three rounds, make it smaller"; run again, the leave
  brief in English took 9 minutes and 448,000 tokens, not clean after six checks, its flow working, its change failed, not shown
  (the manager's screens empty, the later ones only dashes).
- Every prototype of Sonnet's reads the address (32 of 32) and 26 send a form to the next page: in Jean, Sites' frame would have to
  keep a followed link's query (`heard()` drops it) and catch a form sent to another page, which needs a spike in both engines.
- The first judging saw words the check had typed into forms; every run was judged again with the judge told what a tester types
  (`TYPED` in check.js): Sonnet 18 to 21, Haiku 8 to 13. The check takes the first option of each choice.

## The canvas question

No canvas: Sites' one frame shows a page at a time, at a phone's, a tablet's or a computer's width; under it a row of radios, each a
still picture of a page at 390 pixels in the order pressing through reaches them (as the judge's picture is drawn), two to a row on a
phone; under that, where each page leads, as text. Nothing is dragged, nothing hides at 320 pixels, one live document runs whatever
the prototype's length, and the framed views' budget (D475) stays Sites' one.

The write-up, with the recommendation (stop, keep this harness; if built anyway, prototypes as a kind of site), is the doc
[A canvas for prototypes: phase 0](https://claude.ai/artifact/6BtgNw9PcmQNv2CbMYGUJz).
