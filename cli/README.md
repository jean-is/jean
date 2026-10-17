# jean-cli

Jean, an assistant that runs in a browser tab, for people who live in a terminal or an editor.

## Jean in your editor

Jean speaks [ACP](https://agentclientprotocol.com), so any editor that does (Zed, JetBrains, Neovim, Emacs) can use it as its assistant. It works on the folder your editor has open: it reads its files, changes them once you approve each diff, and runs commands in the editor's terminal once you agree.

Its projects, memory, skills and conversations are the ones you have in the browser, through Sync: give it the folder you chose in Settings › Your data. A conversation started in your editor shows in the browser after the next sync, and the other way round.

In Zed's settings:

```json
"agent_servers": {
  "Jean": {
    "command": "npx",
    "args": ["-y", "jean-cli@latest", "acp", "--folder", "~/Jean"],
    "env": { "ANTHROPIC_API_KEY": "…" }
  }
}
```

The brain is the first one whose key the environment holds (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`…), else your own Claude Code with your Claude plan, if you're signed in. `--brain` names another, such as `--brain openai:<its name>` or `--brain ollama:<its name>`, and `--address` gives a server of your own. `--brain copilot` is your own Copilot CLI with your Copilot plan, and `--brain chatgpt:<its name>` your ChatGPT plan, once you have signed in to it from Jean's Settings › Brains on this computer.

## The gateway

Some services, such as Google Workspace or Slack, don't accept connections from a browser. The gateway reaches them for Jean, without keeping anything:

```bash
npx jean-cli gateway --origin https://jean.is
```

Then give its address in Settings › Connections. `GATEWAY_CONFIG` holds the rest of its configuration, the secrets of apps you registered included, and `--port` and `--host` say where it listens.

Node 22 or later. MIT.
