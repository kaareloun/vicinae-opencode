# OpenCode Ask — agent notes

Vicinae extension. Ask OpenCode anything without leaving the launcher.
Spawns `opencode run` and streams the markdown answer into a `Detail` view.
Works as a root-search fallback: type a query, hit Enter on the fallback row,
the answer starts streaming (no need to open the extension first).

## Layout

- `src/ask.tsx` — the single `view` command (search-as-prompt list + recent history).
- `src/chat.tsx` — chat view: exchanges as `List` items (answer in `Detail`), search bar
  is the follow-up box (Cmd+Enter sends), `--session` continues the opencode session.
  No sections, no Send row. Only actions: Send Follow-up, New Chat (+ Retry on failure).
- `src/lib/opencode.ts` — prefs, history (`LocalStorage`), spawn helpers, `ANSWER_STYLE` suffix appended to every prompt.
- `src/lib/jsonl.ts` — pure `opencode run --format json` parsing (no runtime imports, `tsx`-testable).
- `assets/extension_icon.png` — 512x512 `>_` store icon. `assets/ask_icon.png` — chat-bubble command icon.
  Same teal rounded-square style as the display-arranger icons. `.svg` sources kept alongside.

## Discoverability (root search)

- Fallback covers no-match queries; the `List` root receives the query as search text
  and auto-asks (guarded once, ≤1s, `auto-ask` pref). `Form` would drop it — keep `List`.
- Question-word keywords (`what`, `who`, …) cover queries that match something else
  (fallback row hides then). The command takes no manifest arguments, so Enter
  opens the `List` directly with no completer step.
- Item details need `isShowingDetail` on the `List`, or answers stream invisibly.

## Style rules

1. No comments in code by default. Rationale lives here, not in `src/`.
2. Format with biome before committing: `npm run format` (`biome format --write src`).
3. Prefer early return over if/else and ternaries.
3. React component files export only the component.
4. Reuse existing UI components; extract new shared ones when a second use appears.
5. Fix LSP errors immediately.
6. Don't run `npm run build` until the feature is done. Don't start a dev server unless necessary.

## Pre-PR verification (vicinaehq/extensions AI reviewer)

Every PR to `vicinaehq/extensions` gets an automated review plus CI. Policy source of truth:

- `https://raw.githubusercontent.com/vicinaehq/extensions/main/skills/extension-reviewer/SKILL.md`
- `https://raw.githubusercontent.com/vicinaehq/extensions/main/skills/extension-reviewer/rules.json`

Blocking rules and how this extension stays clear of them:

1. `SECURITY-002` (injection) — main risk surface: the user prompt plus `--dir`/`--model`/
   `--agent` prefs and the `--session` id (captured from opencode's own output, never typed)
   all go to `spawn` as a fixed arg array (never a shell string, no `shell: true`),
   so dynamic data is safely parameterized process arguments, which the rule allows.
   JSONL parsing is per-line `try/catch`; a hostile model-output line can't alter syntax.
2. `SECURITY-003` (sensitive data) — no credentials or tokens anywhere. History holds
   only past prompts in `LocalStorage`. Don't add any secret handling.
3. `SECURITY-001` (downloaded executables) — never download or bundle binaries.
   `opencode` is a documented host dependency the user installs.
4. `CORRECTNESS-001` (logic errors) — keep the JSONL leftover-buffer handling exact
   (split on `\n`, reprocess the tail on close); kill the child on unmount so no
   orphan keeps appending state; non-zero exit with empty buffer surfaces `stderr`.
   Autosubmit only fires on an early (≤1s) non-empty search change, guarded to once.
   One send at a time (locked while `sending`); follow-ups reuse the captured session id.
5. `DECEPTION-001` / `MANIFEST-001` — store copy must match behavior. `platforms: ["Linux"]`
   is required (spawns a local `opencode` binary). The fallback row asks immediately
   only when the `auto-ask` preference is on; copy says so via the preference description.
   The `agent` preference defaults to `plan` and the code falls back to `plan` when
   empty, so opencode never runs as `build`; no working directory is shown in the UI
   by design. stdin of the child is closed immediately (`child.stdin?.end()`) so a
   permission prompt can never hang the run silently — it fails fast into `stderr`.
6. `UX-001` (error feedback) — spawn failure toasts and renders error markdown;
   non-zero exit renders `stderr`; empty answers render `_Empty response._`.
7. `UX-002` (loading/empty states) — thinking state shows elapsed time; first-run
   shows `EmptyView` until there is a query or history.
8. `API-001` — prefer `@vicinae/api` over custom code when it covers the use case.
   `node:child_process`/`os` are required here (no Vicinae equivalent for spawning).
9. `PROCESS-001` — one short-lived `opencode run` spawn per question, killed on
   unmount. Never detach or leave children running.
10. `NETWORK-001`, `UX-003`, `FUNCTIONALITY-001`, `QUALITY-001`, `DEPENDENCY-001`,
    `ASSET-001` — no network use by the extension itself, English-only strings,
    not a Vicinae duplicate (opencode integration), no dead or generated code in
    `src/`, only `@vicinae/api` as a runtime dependency, ordinary images.

## Pre-PR commands

1. `npm run format`
2. `npx tsc --noEmit`
3. `npm run lint` (must print "Manifest is valid")
4. `npm run build`
5. Pure-logic check: `npx tsx` script asserting `extractTextDelta` returns text for
   `text` events and null for `step_start`/garbage, `extractMeta` surfaces
   `sessionID`/`tokens` on `step_finish`, and `resolveHome` expands `~/`.
6. In the `vicinaehq/extensions` fork: extension lives at
   `extensions/opencode-ask/`, PR includes `package-lock.json` and excludes
   `node_modules/`, `dist/`, `vicinae-env.d.ts`. Upstream CI runs
   `bun scripts/validate-extension.ts opencode-ask` (also verifies `author`
   is a real GitHub user), `npm ci`, and `vici build`.
