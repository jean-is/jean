# Small office

What most small companies start from: their mail and files, signatures, and the letters, replies and plans they write. Adapt it to what the company said, and write everything people read in the company's language.

## What to connect

- **Mail and files:** Microsoft 365 or Google Workspace, whichever holds the company's mail ([recipes](recipes.md)).
- **Signatures:** Docusign, when the company's plan includes API access. Otherwise its signatures stay in Docusign's own app.
- **Slack,** only if the company uses it.

## The policy

Send this with `company_server`:
- fill in each `<…>` from what the company said;
- write its starters' titles and prompts in the company's language;
- keep only the services connected, each from its recipe.

```json
{
  "name": "<the company's name>",
  "instructions": "<who the company is, what it does and for whom, and how it writes: its tone, how formal, its language>",
  "directory": [
    { "id": "microsoft-365", "clientId": "<from its recipe>", "connected": true },
    { "id": "docusign", "connected": true }
  ],
  "starters": {
    "list": [
      { "title": "Answer a client", "prompt": "Draft a reply to this client: clear, kind and short, in our usual tone." },
      { "title": "Send for signature", "prompt": "Prepare this document for signature with Docusign: who signs, where, and the message that goes with it." },
      { "title": "Write a formal letter", "prompt": "Write a formal letter for this.", "skill": "letter" },
      { "title": "Plan a project", "prompt": "Plan this project: its steps, who does each and by when.", "skill": "project-plan" }
    ]
  }
}
```

- **With Google Workspace instead of Microsoft 365,** its entry is `{ "id": "google", "connected": true }`.
- **Without Docusign,** leave out its entry and its starter.
- **With Slack,** add `{ "id": "slack", "connected": true }`.

## Then

Tell the team to open `https://<address>`, sign in once to each service its row asks for, and start from the starters on the first screen.
