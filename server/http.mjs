import { createAgentRunner } from './agent.mjs';
import { AIError, generateEdit } from './ai.mjs';

// Never log or return provider bodies, request headers or credentials.
export function createAIHandler({ key = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_MODEL, generate = generateEdit } = {}) {
  let active = 0;
  const runAgent = createAgentRunner();
  return async function handleAI(request, response, pathname) {
    if (!pathname.startsWith('/api/liveshow/')) return false;
    const send = (status, body) => { if (!response.destroyed) response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); };
    const origin = request.headers.origin;
    const hostname = new URL(`http://${request.headers.host}`).hostname;
    if (!['localhost', '127.0.0.1'].includes(hostname)) { send(403, { error: 'Use the local loopback address.' }); return true; }
    const ownOrigin = `http://${request.headers.host}`;
    if (origin && origin !== ownOrigin && !['http://localhost:4323', 'http://127.0.0.1:4323'].includes(origin)) {
      send(403, { error: 'Only the local Liveshow workspace may call this service.' }); return true;
    }
    if (pathname.replace(/\/$/, '') === '/api/liveshow/status' && request.method === 'GET') {
      send(200, { configured: Boolean(key?.trim()), model: model || 'OpenRouter default' }); return true;
    }
    if (!['/api/liveshow/edit', '/api/liveshow/agent'].includes(pathname.replace(/\/$/, '')) || request.method !== 'POST') {
      send(405, { error: 'Unsupported API request.' }); return true;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'Use application/json.' }); return true; }
    if (active >= 2) { send(429, { error: 'Two AI requests are already running. Please wait.' }); return true; }
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', disconnected);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > (pathname.includes('/agent') ? 2_000_000 : 64_000)) throw new AIError(413, 'The chart request is too large.');
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AIError(400, 'Invalid JSON request.'); }
      const result = await (pathname.includes('/agent') ? runAgent : generate)(input, { key, model, signal: controller.signal });
      send(200, result);
    } catch (error) {
      send(error instanceof AIError ? error.status : controller.signal.aborted ? 504 : 502,
        { error: error instanceof AIError ? error.message : controller.signal.aborted ? 'AI request timed out. Please try again.' : 'Unable to reach OpenRouter. Please try again.' });
    } finally { clearTimeout(timeout); response.off('close', disconnected); active--; }
    return true;
  };
}
