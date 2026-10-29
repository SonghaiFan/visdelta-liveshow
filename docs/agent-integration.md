# Integrating an AI agent

Liveshow owns interaction and transport. VisDelta owns chart state, validation, differences and animation. The UI now sends natural-language requests to a local OpenRouter service, alongside the existing local presets.

## Render once

```ts
import { createRenderer } from 'visdelta/render';
import { barModule } from 'visdelta/bar';

const view = await createRenderer({ modules: [barModule] }).render(host, spec, {
  data: { sales },
  updates: { policy: 'latest', duration: 550 },
});
```

Keep this view alive across messages. Destroy it when the workspace unmounts.

## Read, propose, apply

Read `view.snapshot()` and send its `spec` and `revision`, plus the data schema, to your agent. Ask the agent for a complete JSON message rather than executable JavaScript:

```json
{
  "requestId": "profit-001",
  "baseRevision": 0,
  "edits": [{ "method": "y", "args": ["profit"] }]
}
```

```ts
const result = await view.edit(message);
const accepted = view.snapshot();
```

Use the current revision rather than hardcoding zero. A stale edit is rejected; read a new snapshot and recompute the intent. A repeated request ID is safe to resend. Surface the returned status in the UI instead of assuming an animation finished.

For a complete chart replacement (the Grain preset demonstrates this), use `view.update(spec)` instead of `edit()`. Invalid JSON and unsupported instructions must be shown as errors, keeping the last valid visualization.

## Rapid changes

The latest policy can supersede pending animation while retaining accepted intent. Wait for acceptance (a changed snapshot revision), then base the next message on that revision; do not wait for the entire animation before allowing the next instruction. The Send burst demo demonstrates this distinction.

## OpenRouter transport

`npm run dev` starts the loopback AI service and the Next.js UI. Next proxies `/api/liveshow/status/` and `/api/liveshow/edit/` to that service. `npm start` serves a production static export with those routes on the same local origin. GitHub Pages serves static assets only and shows AI as unavailable.

The server reads `OPENROUTER_API_KEY` and optional `OPENROUTER_MODEL` from ignored `.env.local`. It calls [OpenRouter chat completions](https://openrouter.ai/docs/api_reference/overview) with strict JSON schema output, sending the current snapshot and prompt. It validates allowed methods and the derived endpoint using public `barModule.edit()` against the built-in sales rows, then returns a server-generated request ID and the original base revision.

The browser checks that its revision is still current, displays the generated message and calls `view.edit()` with animated updates. That persistent renderer uses VisDelta's transition planner for the actual route. Reduced-motion preferences disable animation. No model output is executed as JavaScript.

User text can request another edit during generation; the previous HTTP request is aborted. Manual changes also invalidate stale AI replies. Provider failures, incomplete JSON, unsupported methods, missing fields and refusals preserve the last valid chart.

Implementation: `server/ai.mjs` owns provider calls and validation; `server/http.mjs` owns loopback HTTP guards, body/concurrency limits and cancellation; `components/liveshow/liveshow.tsx` owns the conversation and chart lifecycle. Provider error bodies and credentials are never logged or returned.

The server supports the existing bar edit subset: x, y, where, sort, flip, color, focus and highlight. It does not yet generate complete chart replacements, change chart types, remove filters or accept new data. These limitations are included in the model instructions. Presets retain Grain via complete `update()` declarations.

## Deployment boundary

Do not expose this local server as a shared public service without adding authentication and per-user usage controls. It binds only to loopback and checks request origin/host. API keys are never included in static exports. An eventual authenticated SSE/WebSocket service can use the same versioned edit message contract. Voice input can feed the existing prompt path without changing VisDelta's API.
