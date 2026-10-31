// Jean and OpenClaw, at /compare/openclaw and /fr/comparer/openclaw, for the reader, often at work, who wants
// an AI that acts without the run of the computer: two ways to give an AI hands drawn side by side, then the page as
// every product's is, with Coming from OpenClaw for how to use both. OpenClaw's own documentation, repository and
// advisory, the CVE record and NVIDIA's page are what each fact is read from; product.js writes the page.
import { product } from '../compare/product.js'

export default product({
  addresses: { en: 'compare/openclaw', fr: 'fr/comparer/openclaw', ko: 'ko/compare/openclaw' },
  sources: {
    repo: { url: 'https://github.com/openclaw/openclaw', checked: '2026-10-20' },
    docs: { url: 'https://docs.openclaw.ai/', checked: '2026-10-20' },
    tools: { url: 'https://docs.openclaw.ai/tools', checked: '2026-10-20' },
    skills: { url: 'https://github.com/openclaw/openclaw/tree/main/skills', checked: '2026-10-20' },
    security: { url: 'https://docs.openclaw.ai/gateway/security', checked: '2026-10-20' },
    advisory: { url: 'https://github.com/openclaw/openclaw/security/advisories/GHSA-g8p2-7wf7-98mq', checked: '2026-10-20' },
    cve: { url: 'https://www.cve.org/CVERecord?id=CVE-2026-25253', checked: '2026-10-20' },
    exec: { url: 'https://docs.openclaw.ai/tools/exec-approvals', checked: '2026-10-20' },
    sandbox: { url: 'https://docs.openclaw.ai/gateway/sandboxing', checked: '2026-10-20' },
    nemoclaw: { url: 'https://www.nvidia.com/en-us/ai/nemoclaw/', checked: '2026-10-20' },
    clawhub: { url: 'https://docs.openclaw.ai/tools/skills', checked: '2026-10-20' },
  },
  actions: ['try', 'work'],
})
