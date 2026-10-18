# Accessibility statement

WAREHOUSE SAS means Jean to be usable by everyone, whatever their sight, hearing, movement, language or script. This statement says how far it is, what isn't yet, and how to tell us.

## What it covers

Jean as this repository serves it from `app/`: at jean.is, in a copy an organisation serves, and in the desktop app's window, in all 33 of its languages. Not what others make and Jean shows: sites in its browser pane, pages a brain writes in an answer, and the documents people bring.

## The standard

[WCAG 2.2](https://www.w3.org/TR/WCAG22/), level AA, which covers what [EN 301 549](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf) asks of web content (WCAG 2.1, level AA).

## Status

**Partially conformant.** Some parts are known not to meet the standard, and some haven't been checked yet: both are listed below.

## What is checked, and how

| What | How |
|---|---|
| Contrast of text (1.4.3) | Every word on screen against the pixels actually drawn behind it, in every look, by night and by day, at every stage of the light, and with more contrast asked for: `test/contrast.spec.js`, in CI (D325) |
| Motion (2.3.3) | With the system's reduced motion, nothing on the page moves, in any look, while Jean answers, while Settings and the drawer open, while day turns to night: `test/motion.spec.js`, in CI (D325) |
| More contrast and forced colours | `prefers-contrast: more` gives stronger borders, flat surfaces and a heavier pen for icons; forced colours (Windows' contrast themes) are followed, the presence mark taking the system's text colour |
| Keyboard (2.1.1, 2.4.7) | Everything is reached with the keyboard, focus always shown, with shortcuts for the main actions, listed with ⌘/ (Ctrl+/ outside Apple's systems) ([design.md](../docs/design.md#accessibility)); checked by hand |
| Names (4.1.2) | Every icon button is named for screen readers by its `aria-label`, which is also its tip (D233) |
| Pictures (1.1.1) | A picture Jean makes carries, as its text, the description it was made from |
| Language and direction (3.1.1) | The page says its language; right-to-left languages are laid out right to left, and each message takes the direction of its own words |
| Typing in any script | Nothing is sent while an input method is still composing, as Chinese, Japanese and Korean need |
| Speaking and listening | Dictation and read-aloud are always there, never something to unlock |

The checks were made by WAREHOUSE SAS itself, through the automated tests above and by hand. Jean has not yet been audited by an outside party.

## What isn't accessible yet

- **Screen readers haven't been taken through every journey:** the inbox, as cards arrive while another has focus; moving between the dock's panes and the box; search's results; the box's / and @ menus, and which option Enter picks; a change's diff. Some of these may not be announced as they should.
- **Charts** are named by their title, but their numbers aren't given as text beside them (1.1.1). Asking Jean for the same figures "as a table" gives them as text.
- **Maps and music scores** are drawn as pictures: a score is named, a map's places are named on it but not described in text (1.1.1).
- **Not yet checked:** reflow at 320 pixels wide and text at 200% (1.4.4, 1.4.10), contrast of controls and graphics against what is behind them (1.4.11), target sizes (2.5.8), and whether the light's slow movement, without reduced motion asked for, needs a control of its own (2.2.2).

## What comes next

A screen reader (VoiceOver, NVDA) through every journey above, then an outside audit against WCAG 2.2 AA, before the public launch. This statement changes with each.

## Tell us

If something in Jean stops you, or this statement is wrong, write to [arnaud@jean.is](mailto:arnaud@jean.is): what you were doing, the browser, and any assistive technology you use. We will say what we'll change, and when.

## For an organisation deploying Jean

An organisation that must publish a statement for its own deployment, as public sector bodies in the EU do, may build it on this one. It adds what only it knows: the address it serves Jean from, what its policy turns off, its own contact for feedback, and the enforcement procedure its country names. Its date is the date it checked its own deployment.

Prepared on 18 October 2026.
