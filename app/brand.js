// The only place the name lives. Display only: never use it in storage keys,
// file paths, cache names, CSS classes or element names (see AGENTS.md).
export const BRAND = Object.freeze({
  name: 'Jean',
  domain: 'jean.is',
})

// The brand's site's pages the app links to, by language (site/, D538), held to site/'s by test/home.test.js.
export const PAGES = Object.freeze({
  about: { en: 'jean', ar: 'ar/jean', fr: 'fr/jean', ja: 'ja/jean', ko: 'ko/jean' },
  family: { en: 'family', fr: 'fr/famille', ko: 'ko/family' },
  work: { en: 'work', fr: 'fr/travail', ko: 'ko/work' },
  teachers: { en: 'teachers', fr: 'fr/enseignants', ko: 'ko/teachers' },
  enterprise: { en: 'enterprise', fr: 'fr/entreprise', ko: 'ko/enterprise' },
  help: { en: 'help', fr: 'fr/aide' },
  'help/key-refused': { en: 'help/key-refused', fr: 'fr/aide/cle-refusee' },
})
