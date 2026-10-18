# Example plugins

Four plugins to play with Jean's hooks: the events a plugin watches or answers, the slots it draws in, and the rights the user grants it (D293, D296, D299, D309). Each one is a folder with a `plugin.json` and a `main.js`, as a plugin of anyone's would be.

| Plugin | Hooks | Draws in | Rights | To see it work |
|---|---|---|---|---|
| [Activity log](activity-log/) | `record` (what went for good too: a task deleted, what going back to a request removed), `task.start`, `file.add`, `turn.end` | `answer`, `settings` | watch, draw, notify | Ask anything, then go back to a request with Try again, and open Settings › Plugins |
| [Quiet hours](quiet-hours/) | `tool.check`, more careful only | `above`, `settings` | watch, draw, notify, refuse | Pick "All the time" in its row, then ask Jean to make a web page: it asks first |
| [Trusted sites](trusted-sites/) | `tool.check`, looser for the sites trusted | `above`, `settings` | watch, draw, loosen | Turn the Browser on, ask Jean to open a site, then press Trust it above the box: the next time it opens without asking |
| [At a glance](glance/) | none | `answer`, `settings` | draw | Ask for something long, a comparison or a plan: under the answer, how long it takes to read, a map of its parts and its links. Its row says what each sign stands for |

## Trying one

1. `npm run dev`. It serves Jean at http://127.0.0.1:4173/ and this folder at http://127.0.0.1:4173/examples/, to any page; a deploy never has it.
2. In Jean, turn Plugins on in Settings › Capabilities.
3. In Settings › Plugins, give the address `http://127.0.0.1:4173/examples/plugins/activity-log/`, press Look at it, read its card, and press Add it. An address needs a dot, so `localhost` won't do.

Once this repository is on GitHub, a folder's page there works as well, such as `https://github.com/<owner>/<repository>/tree/main/examples/plugins/quiet-hours`.

To change one, edit its `main.js` and add it again from the same address: it takes the earlier one's place, with the rights granted then, and keeps what it kept. With `?safe` in Jean's address, no plugin runs, and one that fails three times in a visit is turned off.

## How a plugin is made

`plugin.json` gives its `name` (lowercase letters, digits and dashes, the same as its folder), `title` and `description` (and `title-<lang>`, `description-<lang>` for other languages), `version`, `author`, `main` (its module, beside it) and `rights`: `watch` to hook events at all, `draw`, `notify`, `change`, `refuse` (make an action more careful) and `loosen` (let one go ahead without asking).

`main.js` exports `register(on, $)`. It runs in a sandbox of its own, with no network, and reaches Jean only through these:

- `on(event, match?, run)` hooks `task.start`, `file.add`, `tool.check`, `turn.end` or `record`. `run(e, next)` gets the event as plain data; `next(e)` gives what the rest of the chain decided, and returning something else answers in its place: on `tool.check`, `{ decision: 'allow' | 'ask' | 'never', reason? }` or `{ refuse: reason }`. An answer counts only within the plugin's rights, and only if it comes within 5 seconds.
- `$.slot(name, draw)` draws in `above` (above the box), `answer` (under each answer, given `{ text }`) or `settings` (its row in Settings › Plugins). `draw` returns a tree of Jean's elements: text, `{ text, muted }`, `{ text, label }` (text that stands for a picture, `label` being what a screen reader says in its place), `{ row: [...] }`, `{ markdown }` and `{ button, action }`, or null for nothing.
- `$.press(handler)` hears a button's `action`; `$.redraw()` asks Jean to draw it again; `$.notify(text)` shows a short message under its name; `$.store.get(key)` and `$.store.set(key, value)` keep what it needs in its own `data.json`.

The whole protocol is in [docs/architecture.md](../../docs/architecture.md#events-and-slots). `npm test` runs [test/examples.test.js](../../test/examples.test.js) on each of them, and `npm run e2e` adds them to Jean in [test/plugins.spec.js](../../test/plugins.spec.js).
