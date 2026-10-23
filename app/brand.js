// The only place the name lives. Display only: never use it in storage keys,
// file paths, cache names, CSS classes or element names (see AGENTS.md).
export const BRAND = Object.freeze({
  name: 'Jean',
  domain: 'jean.is',
})

// The pages of the brand's own site the app links to, each language's address from its root (site/, D438): About
// Jean, and those to show it to a family, a colleague or an IT team with (D538). test/home.test.js holds them to site/'s.
export const PAGES = Object.freeze({
  about: { en: 'jean', ar: 'ar/jean', fr: 'fr/jean', ja: 'ja/jean' },
  family: { en: 'family', fr: 'fr/famille' },
  work: { en: 'work', fr: 'fr/travail' },
  enterprise: { en: 'enterprise', fr: 'fr/entreprise' },
})
