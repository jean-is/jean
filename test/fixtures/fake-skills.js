// A fake publisher of skills for local end-to-end checks of "Find a skill" (D120): an Agent Skills
// discovery index (schema 0.2) and the SKILL.md files it lists, open to any origin.
// Usage: node test/fixtures/fake-skills.js   (PORT=4183 by default)
//   /.well-known/agent-skills/index.json   two skills, one whose file changed since it was
//                                           listed, and an archive Jean can't use yet
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const SKILLS = {
  'weekly-sales-summary': '---\nname: weekly-sales-summary\ndescription: >-\n  Summarize the weekly sales by region from a spreadsheet:\n  totals per region and month.\nlicense: MIT\n---\n# Weekly sales summary\n\n1. Read the shared spreadsheet.\n2. Total the sales by region and month.\n3. Lead with the region that grew most.\n',
  'invoice-chase': "---\nname: invoice-chase\ndescription: 'Write polite reminders for unpaid invoices, firmer as they age.'\n---\n# Invoice reminders\n\n1. Find the invoice and how late it is.\n2. Write a reminder, kinder when it is new.\n",
  'meeting-notes': '---\nname: meeting-notes\ndescription: Turn a meeting transcript into decisions, owners and next steps.\n---\n# Meeting notes\n',
}
const sha256 = (/** @type {string} */ text) => `sha256:${createHash('sha256').update(text).digest('hex')}`
const INDEX = {
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills: [
    { name: 'weekly-sales-summary', type: 'skill-md', description: 'Summarize the weekly sales by region from a spreadsheet: totals per region and month.', url: 'weekly-sales-summary/SKILL.md', digest: sha256(SKILLS['weekly-sales-summary']) },
    { name: 'invoice-chase', type: 'skill-md', description: 'Write polite reminders for unpaid invoices, firmer as they age.', url: '/.well-known/agent-skills/invoice-chase/SKILL.md', digest: sha256(SKILLS['invoice-chase']) },
    // Listed before its file changed: Jean must refuse it.
    { name: 'meeting-notes', type: 'skill-md', description: 'Turn a meeting transcript into decisions, owners and next steps.', url: 'meeting-notes/SKILL.md', digest: sha256('# An earlier version\n') },
    { name: 'deploy-site', type: 'archive', description: 'Deploy a website with its build scripts.', url: 'deploy-site.tar.gz', digest: sha256('archive') },
  ],
}

export function createFakeSkills() {
  return createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const skill = /^\/\.well-known\/agent-skills\/([a-z-]+)\/SKILL\.md$/.exec(path)?.[1]
    if (path === '/.well-known/agent-skills/index.json') res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(INDEX))
    else if (skill && skill in SKILLS) res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' }).end(SKILLS[/** @type {keyof typeof SKILLS} */ (skill)])
    else res.writeHead(404).end()
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4183
  createFakeSkills().listen(port, '127.0.0.1', () => console.log(`Fake skills on http://127.0.0.1:${port}/.well-known/agent-skills/index.json`))
}
