// SPDX-License-Identifier: MIT
// Skills: a SKILL.md, in plain words, followed when a request matches it or the box names it with /; Jean's own
// ready-made ones by what they are for, each joining the user's as the brain first reads it; the user's own, made with
// Jean, from a file or from a site, read before they come in; where they are kept (D121, D196, D401). Settings › Skills ›
// Add a skill shows its three ways under the part that says them.
import { settings } from '../figures.js'
import { helpArticle } from '../help.js'

/** Settings › Skills › Add a skill: back to Skills, then its three ways to add one, as page.js draws them. */
const ADD = settings({
  back: 'cap.skills.name',
  title: 'skills.addOne',
  sections: [{
    rows: [{ icon: 'brain', title: 'skills.make', text: 'skills.makeText' }, { icon: 'upload', title: 'skills.file', text: 'skills.fileText' }, { icon: 'globe', title: 'skills.site', text: 'skills.siteText' }],
  }],
})

export default helpArticle({
  addresses: { en: 'help/skills', fr: 'fr/aide/competences' },
  kind: 'explainer',
  moment: 'further',
  minutes: 4,
  names: {
    settings: 'settings.title', skills: 'cap.skills.name', add: 'skills.addOne', make: 'skills.make', file: 'skills.file', site: 'skills.site',
    browse: 'skills.browse', source: 'skills.sourceAdd', adding: 'skills.ready.add', see: 'skills.open', save: 'skills.save',
    edit: 'skills.edit', change: 'skills.change', try: 'skills.try', when: 'skills.when', invalid: 'skills.invalid', capabilities: 'settings.capabilities',
    sync: 'cap.sync.name', can: 'help/what-jean-can-do', sees: 'help/ai-sees', kept: 'help/where-kept',
  },
  shows: [null, null, { figure: ADD, caption: 'show.add' }],
  also: ['what-jean-can-do', 'ai-sees', 'where-kept'],
})
