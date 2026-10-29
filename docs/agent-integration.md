# Integrating an AI agent

Liveshow owns interaction and transport. VisDelta owns chart state, validation, differences and animation. The present UI sends local examples through the same public API an agent will use.

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

## Adding transport

The integration seam is `submit()` in `components/liveshow/liveshow.tsx`. A future authenticated backend may deliver complete messages via SSE or WebSocket into this path. Buffer partial model tokens until a full JSON message exists. Use server-side provider credentials and application-owned authorization; never execute model-generated code or place keys in this static site.

No backend, model provider, streaming endpoint or public message API is currently included. Connecting a model should preserve revision checks, receipts and the persistent chart lifecycle already tested here.
