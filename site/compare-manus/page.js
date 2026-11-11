// Jean and Manus, at /compare/manus and /fr/comparer/manus, for the reader who searched for an open-source, free or
// local alternative to it. Manus also starts from a web page, so what sets the two apart here isn't the install but
// where the work happens and where it stays. Manus's own pages are what each fact is read from, its help centre's
// notice of August 2026 included; who owns it now they don't say, so neither does this page. product.js writes it.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/manus', fr: 'fr/comparer/manus', ko: 'ko/compare/manus' },
  sources: {
    home: { url: 'https://manus.im/', checked: '2026-11-01' },
    welcome: { url: 'https://manus.im/docs/introduction/welcome', checked: '2026-11-01' },
    automations: { url: 'https://manus.im/docs/automations', checked: '2026-11-01' },
    skills: { url: 'https://manus.im/docs/features/skills', checked: '2026-11-01' },
    desktop: { url: 'https://manus.im/docs/features/desktop', checked: '2026-11-01' },
    flex: { url: 'https://manus.im/docs/models/manus-flex', checked: '2026-11-01' },
    models: { url: 'https://manus.im/docs/models/built-in-models', checked: '2026-11-01' },
    cloud: { url: 'https://manus.im/docs/features/cloud-browser', checked: '2026-11-01' },
    plans: { url: 'https://manus.im/docs/introduction/plans', checked: '2026-11-01' },
    pricing: { url: 'https://manus.im/pricing', checked: '2026-11-01' },
    team: { url: 'https://manus.im/team', checked: '2026-11-01' },
    privacy: { url: 'https://manus.im/privacy', checked: '2026-11-01' },
    terms: { url: 'https://manus.im/terms', checked: '2026-11-01' },
    change: { url: 'https://help.manus.im/en/articles/16147831-service-change-overview-what-s-happening-and-am-i-affected', checked: '2026-11-01' },
    backup: { url: 'https://help.manus.im/en/articles/16147892-service-change-overview-how-to-back-up-your-data', checked: '2026-11-01' },
  },
  actions: ['sample', 'device'],
  // Its catch, by the part of its promise: what the AI costs or needs and Manus's backups, under the alternative;
  // work that stops with the tab and lives in this browser, under where the work is kept.
  limits: { alternative: [1, 2, 4], where: [0, 3] },
})
