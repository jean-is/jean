# Trust pack

What an organisation's IT, security, privacy and purchasing teams ask for before a pilot, in place of a SOC 2 report. SOC 2 audits a provider's servers and how it runs them. An organisation that serves its own copy of Jean, with its own gateway and no share host of Warehouse SAS's, sends nothing of its own through any server Warehouse SAS runs: the questions are about the code it deploys, which these documents answer and anyone can check. When Warehouse SAS hosts the copy instead (D456), its server serves Jean's files and sees what any web server sees of a visit: [Hosted copies](hosted.md) says what that is, what it keeps and where it runs.

| Document | For | What it answers |
|---|---|---|
| [Threat model](threat-model.md) | Security | What Jean protects, from whom, what stops each threat, what is left to the organisation |
| [ANSSI's recommendations](anssi.md) | Security | Each of the 35 in ANSSI's guide for generative AI systems (ANSSI-PA-102): whether it falls on an organisation deploying Jean, and what answers it, Jean, the organisation, or not yet |
| [Signed releases](releases.md) | IT, security | Deploying Jean without building it, and checking that what is deployed is what Warehouse SAS released |
| [Hosted copies](hosted.md) | Security, privacy | What Warehouse SAS's server sees and keeps when it serves an organisation's copy, where it runs, and what it can't promise |
| [DPIA template](dpia.md) | Privacy | The data protection impact assessment, filled in for what Jean does, left blank for what the organisation decides |
| [Accessibility statement](accessibility.md) | Purchasing, accessibility | WCAG 2.2 AA: what is checked, what isn't accessible yet |
| [Penetration test](pentest.md) | Security | What an outside test covers. Not done yet |
| [Where your files go](../../site/files/en.html) | Everyone | Every address a copy of Jean contacts, and when |
| [Privacy policy](../../site/privacy/en.html), [terms](../../site/terms/en.html) | Privacy, legal | jean.is's own, for those who use it rather than their own copy (D356) |
| [Deploying](../../deploy/README.md) | IT | Recipes for IIS, Azure Static Web Apps, S3 behind CloudFront, containers and Intune, one header set, and `policy.html`, which checks a site as deployed (D415) |
| [Enterprise readiness](../enterprise.md) | IT | The policy, signing in at work, the audit export, retention, and what Jean doesn't do |
| [Architecture: security](../architecture.md#security) | Security | Each page's policy, the sandbox, the preview, the browser pane |
| [Encryption at rest](../encryption.md) | Security | How files are sealed on the device, the lock and recovery |

## Checked by every pipeline

[GitHub Actions](../../.github/workflows/ci.yml) run on each change, as [`.gitlab-ci.yml`](../../.gitlab-ci.yml) does on GitLab:

- types, the unit tests and the budgets (`npm run check`), and a smoke test of each capability in Chromium and WebKit (`npm run e2e`), the policies of every page among them, by the browsers' own reports (D326);
- every package's registry signature (`npm audit signatures`), no known high or critical advisory (`npm audit --audit-level=high`), and the bill of materials of what ships, CycloneDX, kept with the pipeline;
- contrast in pixels at every stage of the light, and nothing moving with reduced motion (D325).

## Reporting a weakness

Write to [arnaud@jean.is](mailto:arnaud@jean.is) with what you found and how to reproduce it. Please keep it between us until it is fixed; we will agree a date with you to publish it, and name you if you wish.

## Keeping it true

Each document says how Jean is now. A change that moves a boundary updates the threat model with it, and the rows of ANSSI's recommendations it answers or changes; a change to what Jean keeps or sends updates the DPIA template and [Where your files go](../../site/files/en.html); a change to the server that hosts copies, where it runs, what it logs or keeps, updates [Hosted copies](hosted.md); a change people see or hear is checked against the accessibility statement.
