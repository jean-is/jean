# Names in masked requests: what Jean's worker finds

Written by `npm run masks -- --write`. hackshare/curtain-privacy at 324c0942, through the engine's whole pipeline, in headless Chromium on one thread of WebAssembly. The set is written, not real, and deliberately dense with names: 120 documents, every person invented. A name counts only if every letter of it is hidden. Gates: recall at least 95%, over-masked under 5%. Only en, fr, de and es are claimed: text holding letters of another script is refused.

| Language | Threshold | Names | Recall | 95% range | Over-masked | Gates |
|---|---:|---:|---:|---|---:|---|
| en | 0.005 | 287 | 100.0 | 98.7–100.0 | 1.0 | pass |
| fr | 0.005 | 252 | 99.6 | 97.8–99.9 | 1.0 | pass |
| de | 0.005 | 264 | 97.0 | 94.1–98.5 | 1.1 | pass |
| es | 0.005 | 272 | 99.6 | 97.9–99.9 | 1.3 | pass |
| ar | 0.005 | 349 | 5.7 | 3.7–8.7 | 0.0 | fail |
| ja | 0.005 | 285 | 3.9 | 2.2–6.8 | 2.3 | fail |
| zh | 0.005 | 344 | 6.4 | 4.3–9.5 | 2.9 | fail |
| ko | 0.005 | 216 | 8.3 | 5.3–12.8 | 0.8 | fail |

10 pages (30,000 characters) on one thread here: 8.9 s; the tab now holds 0.93 GB.
