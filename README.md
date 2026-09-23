# OpenCode Ask

Ask OpenCode anything without leaving Vicinae. Responses stream straight into the launcher.

![Ask OpenCode chat example](assets/demo.png)

## Ask from root search

Three flows, fastest first:

1. **Fallback (any question)** — run **Manage fallback commands**, tick **Ask OpenCode**.
   Type anything (`What is…`, `who…`, `Can you…`) that matches nothing else, hit Enter
   on the fallback row. Answer streams immediately (disable via `auto-ask`).
2. **Question words** — `what`, `who`, `where`, `when`, `why`, `how`, `which`, `can`,
   `could`, `would`, `should`, `explain` are command keywords, so Ask OpenCode also ranks
   in normal results when something else matches (e.g. Calculator on `what is 2+2`).
3. **Prefix** — give the command an alias (e.g. `ai`) in settings, then type `ai `,
   complete the inline question argument, Enter. Same as Raycast AI.

## Command

- **Ask OpenCode** (`ask`) — search bar is the prompt. Hit Enter to ask, or pick from recent history.
- Answer opens a chat: the whole window is the conversation, newest first, answer streams
  into the selected item. The search bar at the top is the follow-up box (Cmd+Enter sends,
  same session continues). Actions: Send Follow-up, New Chat (Cmd+N), Retry on failure.

## Preferences

| Preference | Default | Purpose |
|---|---|---|
| OpenCode binary | `opencode` | Path/name of the executable |
| Working directory | home dir | Project context opencode runs in |
| Model override | empty | e.g. `anthropic/claude-sonnet-4-5`; empty = opencode default |
| Agent | `plan` | Agent opencode runs as. Always plan unless explicitly changed — never build |
| Ask fallback text automatically (`auto-ask`) | on | Start asking immediately on fallback/argument launch |

Set them under Settings → Extensions → OpenCode Ask (input row → Save writes to config, Reset restores the default).

## How it works

Spawns `opencode run "<question>" --format json` in the working directory and renders `text` events live into a `Detail` view. No server, no API keys — it uses your existing opencode setup.

## Develop

```bash
npm install
npm run dev    # live reload, needs Vicinae running
npm run format # biome
npm run lint   # must print "Manifest is valid"
npx tsc --noEmit
npm run build  # installs to ~/.local/share/vicinae/extensions/opencode-ask
```
