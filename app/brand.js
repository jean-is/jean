// SPDX-License-Identifier: MIT
// The only place the name lives. Display only: never use it in storage keys,
// file paths, cache names, CSS classes or element names (see AGENTS.md).
export const BRAND = Object.seal({
  name: 'Jean',
  domain: 'jean.is',
})

// The brand's site's pages the app links to, by language (site/), held to site/'s by test/home.test.js.
export const PAGES = Object.freeze({
  home: { en: '', ...Object.fromEntries('ar br co da de es fi fr fr-CA ha hu id it ja ko ms nl pl pt ro tl zh-Hans zh-Hant'.split(' ').map((lang) => [lang, lang])) },
  help: { en: 'help', fr: 'fr/aide' },
  'site-map': { en: 'site-map', fr: 'fr/plan-du-site' },
  'help/key-refused': { en: 'help/key-refused', fr: 'fr/aide/cle-refusee' },
  'help/couldnt-reach': { en: 'help/couldnt-reach', fr: 'fr/aide/injoignable' },
  'help/plan-stopped': { en: 'help/plan-stopped', fr: 'fr/aide/forfait-arrete' },
})
