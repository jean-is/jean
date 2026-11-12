// SPDX-License-Identifier: MIT
// How accessible Jean is, Warehouse SAS's statement for jean.is alone: an organisation's copy publishes its own, so
// this page doesn't ship (D672). Its text in each language, <lang>.html, as written, and its title and description,
// <lang>.json (site/site.js, D438). How each check runs is docs/trust/accessibility.md.
import { prose } from '../site.js'

export default { ...prose({ en: 'accessibility', fr: 'fr/accessibilite' }), ships: false }
