# How Jean's accessibility is checked

[jean.is/accessibility](https://jean.is/accessibility) is Warehouse SAS's statement: what it covers, what isn't accessible yet, what comes next and how to report a problem, in English and French. This is what stands behind it, for whoever has to verify it.

## The standard

[WCAG 2.2](https://www.w3.org/TR/WCAG22/), level AA, which covers what [EN 301 549](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf) asks of web content (WCAG 2.1, level AA). In France, [RGAA](https://accessibilite.numerique.gouv.fr/) 4.1.2, whose criteria the audit measures.

## Status

**Partially conformant with [RGAA](https://accessibilite.numerique.gouv.fr/) 4.1.2: 49 of 88 applicable criteria met, 55.7%,** by our own audit of 1 November 2026: [the report](rgaa-audit-2026-11.md) and [the grid](rgaa-audit-2026-11.xlsx). What couldn’t be checked counts as not met. An AI made the audit. Separate AI readers, given none of its verdicts and told of no fix, judged the criteria again in three rounds, and the last verdict on each counts. The last round read what fixes claimed to close, and failed about half of it. The sample holds the documents and collections people create, the Word and Excel files they save as, and a flowchart, a map and an answer with sources. No person has checked the result or taken Jean through it with a screen reader, and no outside party has audited Jean against any standard.

## What is checked, and how

| What | How |
|---|---|
| Contrast of text (1.4.3) | Every word on screen against the pixels actually drawn behind it, in every look, by night and by day, at every stage of the light, and with more contrast asked for, on the first screen, a conversation, Settings and the tasks: `test/contrast.spec.js`, in CI (D325). Some words the test doesn’t reach fall short (N65 in the audit) |
| Contrast of controls (1.4.11) | An icon that is all a button shows, a text box's frame (at rest and while it has the keyboard), the mark on the Settings section and the task open, and every focus ring, at 3:1 against what is beside them, measured in pixels in every look, by night and by day, at rest and with the light at its brightest, in English, Arabic and Japanese, on the same screens: `test/nontext.spec.js`, in CI (D420). What is active in search and a document’s menus, which it doesn’t measure, falls short (N66 in the audit) |
| Reflow (1.4.10) | At 320 by 256 CSS pixels, a 1280 by 1024 screen zoomed to 400%, the page never scrolls sideways (a table scrolls in a box of its own), no words are cut, and every line can be scrolled into view, out from under the header and the box: on the first screen, a conversation with an answer, a request for approval, Settings and the tasks, in every look, in English, Arabic and Japanese, `test/reflow.spec.js`, in CI (D420). At that width the name of the brain in the box may end with an ellipsis: the button's name keeps it whole, and what it opens shows it |
| Text at 200% (1.4.4) | The same, with the browser's text size at 200%, and with the window zoomed to 200%: `test/reflow.spec.js`, in CI (D420) |
| Target size (2.5.8) | Everything the pointer can press is at least 24 by 24 CSS pixels, or spaced so that a 24-pixel circle on it meets no other target, without the exception for links in a line of text: on the first screen, an answer, its + menu, the user's menu, Settings and the tasks, in every look, on a laptop and a phone, `test/targets.spec.js`, in CI (D420). A design's marks, which it doesn't reach, are smaller |
| Pause, stop, hide (2.2.2) | At rest nothing on the page moves for more than five seconds, in any look: the wave in Jean's mark travels and the room's light breathes only while Jean works on what was asked, which Stop ends, and a wave waiting for an answer pulses twice: `test/motion.spec.js`, in CI (D420) |
| Motion (2.3.3) | With the system's reduced motion, nothing on the page moves, in any look, while Jean answers, while Settings and the drawer open, while day turns to night: `test/motion.spec.js`, in CI (D325) |
| More contrast and forced colours | `prefers-contrast: more` gives stronger borders, flat surfaces and a heavier pen for icons; forced colours (Windows' contrast themes) are followed, the presence mark taking the system's text colour |
| Keyboard (2.1.1, 2.4.7) | Shortcuts for the main actions, listed with ⌘/ (Ctrl+/ outside Apple's systems) ([design.md](../design.md#accessibility)). Nearly everything is reached with the keyboard, checked by hand: moving a pane or a collection's column can't be done with keys, and a document shows the keyboard only by its caret and a thin line under its pane's head (N25 and N51 in the audit) |
| Names (4.1.2) | Every icon button is named for screen readers by its `aria-label`, which is also its tip (D233) |
| Pictures (1.1.1) | A picture Jean makes carries, as its text, the description it was made from |
| Language and direction (3.1.1) | The page says its language; right-to-left languages are laid out right to left, and each message takes the direction of its own words |
| Typing in any script | Nothing is sent while an input method is still composing, as Chinese, Japanese and Korean need |
| Speaking and listening | Dictation and read-aloud are always there, never something to unlock |
| The site's pages | What WCAG 2.2 asks at levels A and AA, read by axe-core in a browser, every page in every language, its first in light and dark: `test/site.spec.js`; what `site/checks.js` reads from the HTML stops the build (D438) |

The checks were made by Warehouse SAS itself, through the automated tests above and by hand. The audit's method, sample and tools, and what it couldn't check, are in [its report](rgaa-audit-2026-11.md).

## For an organisation deploying Jean

The statement speaks for jean.is, so a copy doesn't have it. An organisation that must publish a statement, as public sector bodies in the EU do, and in France companies with over €250 million of turnover, publishes its own for the address it serves Jean from: what its policy turns off, its own contact for feedback, and the enforcement procedure its country names. Its date is the date it checked its own deployment.

In France, that is a declaration on [RGAA's template](https://accessibilite.numerique.gouv.fr/ressources/modele-de-declaration/), from an audit of its own copy, with its multi-year plan, this year's action plan and the homepage mention that audit earns. The checks above and [our grid](rgaa-audit-2026-11.xlsx) can help prepare that audit, but they don't replace it.

Prepared on 18 October 2026, and brought up to date on 1 November 2026.
