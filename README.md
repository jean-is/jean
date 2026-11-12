![Jean, in a browser tab. Create with any AI, keep everything.](docs/banner.webp)

# Jean

**Create with any AI, keep everything.** Anything in, anything out, with GPT, Claude, Gemini or an AI on your own computer. Your history, files and memory stay on your device. Nothing to install. Free and open source.

[**Open Jean at jean.is**](https://jean.is) · [Help](https://jean.is/help)

[![Jean in a minute: a spreadsheet becomes a chart worked out by a program, a letter written by an AI on the computer itself, an email sent only once allowed, and everything kept on the device.](docs/reel.webp)](https://jean.is/watch)

*Jean in a minute, played by Jean itself. [Watch it with sound, in your language](https://jean.is/watch).*

## Why

AI that does real work has arrived, and it has arrived behind subscriptions, installers and other people's servers. The best personal agents today ask you to type commands into a terminal, keep a computer running, or hand your files to a company's cloud. Most people can do none of that, and none of them should have to.

The browser is already on every device. It is the most battle-tested sandbox ever built, it speaks every language, and it belongs to no one. That is where Jean lives.

## What Jean does

Ask in words or with a file, and Jean hands back what you asked for, made: an answer with its sources, a document, a spreadsheet, a chart. It works things out by running real calculations instead of guessing, shows you what it is doing while it works, and asks before anything that matters: sending, sharing, deleting, anything outside. It never touches passwords or payments.

## What makes Jean different

- **Private by design.** What Jean keeps is encrypted in your browser, and no Jean server can read it. You choose where the thinking happens: on your device, with a provider you pick, or through a plan you already pay for, such as Claude, ChatGPT or Copilot. Each answer says where it was done.
- **Free and open.** Open source, no subscription. Bring any AI, or none: on a capable computer, Jean thinks entirely on the device, offline too.
- **Simple first, deep later.** Jean starts as a single box. Everything else, from your folders and your other devices to other people, memory, routines and voice, shows up when you need it, like a game that teaches itself. [docs/product.md](docs/product.md#what-jean-does) lists it all.
- **Yours to keep.** Everything Jean knows is stored as plain files you can read, back up and take elsewhere.
- **For everyone.** 46 languages, right to left included, from the first screen to the last answer.
- **Small on purpose.** Jean's code is small enough to audit: no build step, three libraries loaded up front, and [budgets](budgets.json) checked on every change keep it that way. That is a promise, and a feature.

## What Jean won't do

Jean does not work while you are away: that would need a server watching over your things. Routines run while Jean is open, and when you come back, it tells you what changed since last time.

Jean does not take over your computer. It works inside the browser's walls, and steps outside them only into a folder you open for it, asking before it runs anything there.

Jean keeps no copy of your things anywhere else. They live in one browser, at the address you opened Jean from, so clearing that site's data clears them too: keep a backup, or a synced folder. [Good to know](docs/product.md#good-to-know) has the browsers Jean needs.

## Run it yourself

With Node 22 or later:

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:4173 and pick a brain. To try Jean without any account, start the fake brain the tests use, and connect it under *On your computer → Other* at `http://127.0.0.1:4174/v1`:

```bash
node test/fixtures/fake-brain.js
```

To host your own copy, serve `dist/web/` from `npm ci && npm run build:web` over HTTPS, at an address that won't change: [deploy/](deploy/README.md) has the headers and a recipe for each host. [gateway/](gateway/README.md) reaches the services that refuse a browser, [cli/](cli/README.md) puts Jean in your editor, and `npm run build:desktop` makes the [desktop apps](docs/architecture.md#desktop-app).

## Contributing

Read [AGENTS.md](AGENTS.md) before writing code: it holds the rules every change follows, and every command. Before you push, `npm run check` builds, type-checks, runs the tests and checks the budgets. `npm run e2e` runs the browser tests in Chromium and WebKit against the fake brain (first, once: `npx playwright install chromium webkit`). [CI](.github/workflows/ci.yml) runs both on every push and pull request, and `npm run ci` runs its jobs on your machine, in Docker.

Bugs and questions go in [issues](https://github.com/jean-is/jean/issues). Report a vulnerability privately, as [SECURITY.md](SECURITY.md) says.

## Documentation

- **What Jean is:** [product.md](docs/product.md), the user, the vocabulary and every feature; [design.md](docs/design.md), its identity, Tilde and the themes.
- **How it is built:** [AGENTS.md](AGENTS.md), the rules; [architecture.md](docs/architecture.md); [decisions.md](docs/decisions.md), every decision that binds, and [open-questions.md](docs/open-questions.md), what is still undecided; [roadmap.md](docs/roadmap.md), the versions and what the launch needs.
- **Features in depth,** each with its work left: [together.md](docs/together.md), [sharing.md](docs/sharing.md), [encryption.md](docs/encryption.md), [certificates.md](docs/certificates.md), [reels.md](docs/reels.md).
- **For an organisation:** [enterprise.md](docs/enterprise.md), policy and what is enterprise; [trust/](docs/trust/README.md), for IT, security and privacy teams.
- **Running a copy:** [deploy/](deploy/README.md), [gateway/](gateway/README.md), [cli/](cli/README.md).
- **Where Jean comes from:** [background.md](docs/background.md), DEVS and the field.

## License

Jean is open source under the [MIT license](LICENSE). The enterprise integrations in [`app/ee/`](app/ee/) are under the [Elastic License 2.0](app/ee/LICENSE) and need a key. An [additional grant](app/ee/GRANT.md) makes them MIT if keys can't be bought for twelve months (D139).
