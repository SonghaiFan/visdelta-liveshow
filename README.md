# VisDelta Liveshow

A real-time visualization workspace for AI agents. An agent sends a small declarative JSON edit; VisDelta changes the existing chart in place.

- [Open Liveshow](https://songhaifan.github.io/visdelta-liveshow/)
- [Agent integration](docs/agent-integration.md)
- [VisDelta public API](https://songhaifan.github.io/visdelta/docs/guides/json/)

## Current capabilities

Seven categories of edits, editable JSON, persistent chart rendering, animated updates, revision checks, idempotent requests, latest-update scheduling, burst receipts, reset and responsive layouts. The included sales data is illustrative.

The demo uses local presets. **No model or AI service is connected yet.** AI transport, authentication and model selection belong to this downstream application; chart semantics and rendering belong to VisDelta.

## Develop

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open http://localhost:4323/. Both `/` and `/liveshow/` open the workspace.

```sh
npm run lint
npm run types:check
npm run build
npx playwright install chromium
npm test
```

Tests exercise actual chart changes, all seven categories, duplicate and stale requests, interruption, invalid JSON, resize, reload and idle stability on desktop and mobile.

## Dependency boundary

Only public `visdelta/core`, `visdelta/bar`, `visdelta/render` and `visdelta/style.css` exports are used. The repository includes the installable VisDelta 0.4.2 package snapshot in `vendor/`; no sibling checkout or private source imports are required. `npm run boundary:check` guards that boundary. Update the package snapshot and lockfile together when upgrading VisDelta.

## Deployment

GitHub Actions builds, checks and tests the static export before deploying it to GitHub Pages. `LIVESHOW_BASE_PATH=/visdelta-liveshow` enables project-site hosting. The website contains no secrets; a future AI service must keep provider credentials on its server.

## Direction

Connect a server-side AI agent to this same edit interface, stream complete validated edit messages to the workspace, and support additional chart modules through VisDelta. Natural language inference and streaming transports are planned, not implemented.
