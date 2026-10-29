# VisDelta Liveshow

A real-time visualization workspace for AI agents. An agent sends a small declarative JSON edit; VisDelta changes the existing chart in place.

- [Open Liveshow](https://songhaifan.github.io/visdelta-liveshow/)
- [Agent integration](docs/agent-integration.md)
- [VisDelta public API](https://songhaifan.github.io/visdelta/docs/guides/json/)

## Natural-language chart editing

The app has a presentation canvas and a conversation panel at the lower right. Type a request such as “Show profit instead of revenue, rank highest first, and use blue bars.” The local agent uses real MCP tools to read chart state, inspect visible marks and obtain a PNG through VisDelta public APIs. When it calls `capture_chart`, the chart image is passed to OpenRouter as vision input. Mutating tools run through the browser; the actual browser snapshot is checked against the VisDelta-validated target before replying. Ordinary requests normally finish after one edit batch; dependent operations may explicitly continue to a second batch. Identical failed edits are blocked, and one correction is allowed. Ambiguous requests produce a clarifying question without changing the chart.

### Add your key

Requires Node.js **22.18 or later**.

```sh
npm ci
cp .env.example .env.local
```

Paste your key after `OPENROUTER_API_KEY=` in `.env.local`. Optionally set `OPENROUTER_MODEL` to an OpenRouter model ID supporting image input and tool calling (for example `openai/gpt-4.1-mini`). Leaving it blank uses your account default. The local `.env.local` is ignored by Git. Never add a `NEXT_PUBLIC_` prefix to the key.

```sh
npm run dev
```

Open http://localhost:4323/. Restart after changing `.env.local`. The local AI service listens on loopback only; the key stays on the server. Your prompt and the current illustrative chart declaration are sent to OpenRouter. There is no public shared-key backend.

GitHub Pages serves the same UI with working presets and manual JSON edits. **AI requires the local server**; adding a local key does not enable AI on the hosted Pages site. To serve the production export locally:

```sh
npm run build
npm start
```

The start command prints the correct local URL, including the base path used by the build. Both `/` and `/liveshow/` open the workspace.

### Supported requests

Remap revenue/profit, filter rows, sort, flip axes, change fixed bar colors, focus and highlight. Positional requests such as “highlight the third bar” use the current rendered spatial order, including after sorting. “Change that one” prompts a clarification. Recent conversation is provided on follow-up turns. Compound requests can produce multiple edits; Natural/Quick/Slow controls the VisDelta transition duration per stage. Current chart state carries context into subsequent requests.

The model cannot invent data or execute code. Natural-language reset/复原 restores the initial chart, undo/撤销 restores the previous accepted state, and redo/重做 reapplies an undone state. These actions restore complete declarations via `update()` and retain VisDelta transitions. Undo, Redo and Reset are also available in the toolbar; history is session-local and capped at 40 states. A new edit clears redo history. Unsupported requests (including changing chart type/grain or removing only one specific filter while preserving all other changes) return an explanation without changing the chart. Presets still demonstrate all seven categories, including complete-state Grain updates. A newer request cancels pending AI generation; late replies based on an older chart revision are discarded. Reset restores the original chart.

Presets, source data, generated JSON, state-change categories and update receipts are available under “Explore presets, data & generated edits”. Voice input is not implemented yet.

## Verification

```sh
npm run test:server
npm run lint
npm run types:check
npm run build
npx playwright install chromium
npm test
```

Server tests exercise genuine MCP client/server exchanges, image forwarding, browser receipts, clarification and OpenRouter request construction and error handling with a mocked upstream, plus real VisDelta validation. Browser tests exercise real chart updates with mocked AI responses, revision conflicts, cancellation, responsive layouts and all seven presets. Live provider verification requires a configured key and is separate from these tests.

## Dependency boundary

Only public `visdelta/core`, `visdelta/bar`, `visdelta/render` and `visdelta/style.css` exports are used, including `ChartView.capture()` and `ChartView.inspectMarks()`. The repository includes the installable VisDelta 0.4.2 package snapshot in `vendor/` (including public observation APIs and the empty-state layout/restoration fix); no sibling checkout or private source imports are required. `npm run boundary:check` guards that boundary. Update the package snapshot and lockfile together when upgrading VisDelta.

## Deployment

GitHub Actions builds, checks and tests the static export before deploying it to GitHub Pages. `LIVESHOW_BASE_PATH=/visdelta-liveshow` enables project-site hosting. The website contains no secrets; a future AI service must keep provider credentials on its server.

## Direction

Add voice input to the same agent submission path, then introduce more chart modules through VisDelta. The MCP server factory can be reused with another transport; currently the agent connects in-process, without exposing an external MCP endpoint. A shared online AI backend would additionally require deployment, authentication and usage controls; the included service intentionally binds to localhost.
