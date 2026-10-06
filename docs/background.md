# Background

Where Jean comes from, and the field it enters, as measured on 2026-10-01 (DEVS v0.8.2, commit `bf66fc8`; star counts from the GitHub API that day). This space moves monthly: check again before quoting anything here.

## DEVS, honestly

| | |
|---|---|
| Code | About 249k lines of TS/TSX in 951 files, plus 34k lines of tests: connectors 30k, marketing pages inside the app 27k, marketplace and studio 22k, orchestrator and teams 11k |
| Dependencies | 50 runtime and 33 dev; `node_modules` is 1.9 GB; HeroUI v2 and v3 side by side |
| Pace | 395 commits in 14 months, 381 by one person |
| First load (devs.new) | 7.4 MB of JS and CSS, 1.7 MB gzipped |
| Traction | 53 stars, 2 forks, no outside contributors |

- **The thesis was right; the product never had a focus.** "Delegate to a swarm of agents" describes how it is built, not a job someone wants done.
- **The bloat was a symptom: no feature was ever turned down.** About 18k lines a month from one person is AI-assisted coding without limits.
- **It broke its own principles:** "works on 2 GB devices" with a 1.7 MB first load; "no servers" with a Postgres stack and a search proxy (`proxy.devs.new`); MCP still under "Future".
- **The swarm was the wrong bet.** 2026's winners are one strong agent with tools, skills and memory: pi, OpenClaw, Hermes, Claude Code.
- **The bottleneck was never the code,** but positioning and getting it in front of people.

**What carries over:** the thesis (the browser as the runtime, privacy by design, bring your own model), what DEVS learned of providers' quirks, its in-tab sandboxes as reference (QuickJS limits, Pyodide), and its built-in prompts mined for procedures, rewritten as skills. Ideas and knowledge only: no files, domain or data (D38). **What stays behind:** connectors (MCP replaces them), the marketplace and studio (plain files), the orchestrator, teams and methodologies (one loop plus helpers), the traces UI (ACP events), P2P sync on Yjs (files), the marketing pages, the meeting bot, the Teams/Postgres stack, HeroUI, Tailwind and the icon pack.

**Why reboot rather than refactor** (D1): "never rewrite" protects users and years of fixes, which DEVS didn't have at scale; cutting 95% through a half-finished UI-library migration is harder than writing about 5k clean lines. The real risk is the second-system effect, which is why [budgets.json](../budgets.json) is enforced in CI.

## The field

**Personal agents,** the category Jean enters: OpenClaw (391k, a gateway on your machine reachable from 20+ chat apps), Hermes Agent (251k, writes and improves its own skills), pi (111k; its 1.0 brought codemode, deferred tools, cache warming and mid-conversation system messages, the source of D46–D49), and the "ultra-lightweight" nanobot, nanoclaw and picoclaw. All need an install; pi has no permission system. **None runs in a browser tab.**

**AI chat clients,** where people will place Jean by default: Open WebUI 154k, NextChat 89k, LobeHub 83k, AnythingLLM 67k, Cherry Studio 52k, Jan 45k, LibreChat 45k, Chatbox 42k, big-AGI 7k. Bring-your-own-key chat is a commodity: Jean has to visibly produce things.

**Multi-agent frameworks,** DEVS's category: AutoGPT became a platform; MetaGPT and AutoGen stalled; CrewAI and OpenManus are active; Flowise and AgentGPT are archived. AgentGPT was the browser-based autonomous agent: people were curious, but it couldn't do real work.

**Adjacent:** browser automation (browser-use, Nanobrowser, BrowserOS, PageAgent), coding agents (opencode, Codex, Gemini CLI), workflow builders (n8n, Dify), commercial agents (ChatGPT agent, Claude Cowork, Manus), and the closest attempts at an agent in a tab, Mozilla.ai's wasm-agents and big-AGI.

**OpenAI Dots** (DevDay, week of 2026-09-28): always-on personal agents, each on its own cloud computer with a browser and 4,000+ plugins, learning habits and messaging you through ChatGPT, Slack or Teams. Jean borrows allow / ask / never rules with a review of consequential actions, read-only background research, an inspectable activity view, a decision inbox, naming the assistant, learned habits and a shared space where each person uses their own assistant. It doesn't copy the cloud computer, the app catalogue, reaching out through chat apps, or controlling the user's computer.

| | A Dot | Jean |
|---|---|---|
| Lives | In OpenAI's cloud | In your browser |
| Costs | A Pro or Business Premium subscription | Free, open source |
| Your files | Uploaded to their workspace | Stay on the device, unless you pick a cloud brain |
| Models | OpenAI's | Any: on the device, a cloud account, or your own key |
| Works while you're away | Yes | No, and it says so |

**Decision models,** all released in September and October 2026: text and typed questions in, calibrated probabilities out, mostly in TypeSafe's `/v1/systemone` shape.

| Model | Weights | Size | In a browser | Languages | Unfamiliar tasks (maker's figures) |
|---|---|---|---|---|---|
| Jev (TypeSafe) | Hosted; also on OpenRouter | — | No | Not documented | 0.857 |
| Clef / Clef-flash (Cloudflare) | Apache 2.0 | 27B / 9B | No (GPU server) | Not documented | 7 of 10 benchmarks |
| Strands Decider (AWS) | Apache 2.0 | 2B | No official build | Not documented | ~72% on JevBench |
| Laya multilingual | Apache 2.0 | 322M | Yes (laya-ts) | 100+ | 0.36 untuned, 0.77 fine-tuned |
| **Kev-0.6B / 4B** | Apache 2.0 | ~340 MB / ~1.07 GB | **Yes** (Transformers.js) | Trained in English, Qwen3 base | 0.62 / 0.79 |

**Event standards:** ACP (Zed and JetBrains; `title`, `kind`, `status`, `locations`, and permission requests with allow and reject, once or always; adopted by Zed, JetBrains, Gemini CLI and Copilot CLI) suits an interface watching an agent work; AG-UI 1.0 (CopilotKit) suits a web frontend streaming from an agent on a server. Jean uses ACP (D17).

## Sources

- Personal agents: [OpenClaw vs Hermes (Composio)](https://composio.dev/content/openclaw-vs-hermes-agent) · [OpenClaw vs Hermes vs Pi](https://claw4science.org/blog/agent-harness-three-way) · [Pi 1.0](https://earendil.com/posts/pi-1-0/) · [pi v1.0.0 release notes](https://github.com/earendil-works/pi/releases/tag/v1.0.0)
- Agents in a tab: [Mozilla.ai wasm-agents](https://blog.mozilla.ai/wasm-agents-ai-agents-running-in-your-browser/)
- OpenAI Dots: [Engadget](https://www.engadget.com/2272230/dots-are-openais-new-personal-agents-and-soon-youll-be-able-to-control-several-of-them/) · [VentureBeat](https://venturebeat.com/technology/openai-launches-dots-always-on-ai-agent-coworkers-and-chatgpt-space-where-they-can-collaborate-with-human-teams)
- Decision models: [Jev (OpenRouter)](https://openrouter.ai/blog/insights/what-is-jev/) · [Clef](https://blog.cloudflare.com/clef-decision-models/) · [Strands Decider](https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19) · [Laya](https://github.com/vcsoc/laya) · [kev-0.6b-ONNX](https://huggingface.co/onnx-community/kev-0.6b-ONNX)
- Event standards: [ACP tool calls](https://agentclientprotocol.com/protocol/tool-calls) · [AG-UI 1.0](https://www.copilotkit.ai/blog/ag-ui-1.0)
