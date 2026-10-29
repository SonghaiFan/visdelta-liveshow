import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateEdit, validateInput, validatePlan } from '../../server/ai.mjs';
import { createAIHandler } from '../../server/http.mjs';
import { initialSpec } from '../../components/liveshow/presets.ts';
const input = { prompt: '显示利润，然后用蓝色', revision: 3, spec: initialSpec };
const plan = { explanation: '改为利润和蓝色。', edits: [{ method: 'y', args: ['profit', { type: 'quantitative' }] }, { method: 'color', args: ['#4269d0'] }] };

test('OpenRouter request produces a real VisDelta-validated versioned edit', async () => {
  const result = await generateEdit(input, { key: 'test-only', model: 'test/model', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'test/model');
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(JSON.parse(body.messages[1].content).revision, 3);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...plan, edits: plan.edits.map(({ method, args }) => ({ method, arguments: JSON.stringify(args) })) }) } }] });
  } });
  assert.equal(result.message.baseRevision, 3); assert.ok(result.message.requestId);
  assert.deepEqual(result.message.edits, plan.edits);
});
test('refusal is returned without an edit', async () => {
  assert.equal((await validatePlan({ explanation: 'Not supported', edits: [] }, validateInput(input))).message, null);
});
test('unknown fields, methods and invalid arguments are rejected by the boundary', async () => {
  for (const edit of [{ method: 'eval', args: ['alert(1)'] }, { method: 'y', args: ['imaginary'] }, { method: 'flip', args: [1] }]) {
    await assert.rejects(validatePlan({ ...plan, edits: [edit] }, validateInput(input)));
  }
  assert.throws(() => validateInput({ ...input, spec: { ...initialSpec, data: { url: 'https://example.com' } } }));
  assert.throws(() => validateInput({ ...input, prompt: 'x'.repeat(2001) }));
});
test('missing key, upstream errors and malformed plans remain safe', async () => {
  await assert.rejects(generateEdit(input, {}), /OPENROUTER_API_KEY/);
  for (const status of [401, 402, 429, 500]) {
    await assert.rejects(generateEdit(input, { key: 'test-only', fetchImpl: async () => new Response('private-provider-detail', { status }) }), error => !error.message.includes('private-provider-detail'));
  }
  for (const data of [{ error: { message: 'private' } }, { choices: [{ message: { content: '{' } }] }, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }]) {
    await assert.rejects(generateEdit(input, { key: 'test-only', fetchImpl: async () => Response.json(data) }), /complete JSON/);
  }
});
test('loopback HTTP route checks origin, content type and missing credentials', async t => {
  const handler = createAIHandler({ key: '', model: '' });
  const server = createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost').pathname)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/liveshow`;
  const status = await fetch(`${url}/status/`); assert.equal((await status.json()).configured, false);
  assert.equal((await fetch(`${url}/edit/`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${url}/edit/`, { method: 'POST', body: '{}' })).status, 415);
  const result = await fetch(`${url}/edit/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(result.status, 503); assert.match((await result.json()).error, /OPENROUTER_API_KEY/);
});

test('HTTP prompt to provider to VisDelta validation returns an applicable edit', async t => {
  const handler = createAIHandler({ key: 'test-only', model: 'test/model',
    generate: (body, config) => generateEdit(body, { ...config, fetchImpl: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...plan, edits: plan.edits.map(({ method, args }) => ({ method, arguments: JSON.stringify(args) })) }) } }] }) }) });
  const server = createServer(async (req, res) => { await handler(req, res, new URL(req.url, 'http://localhost').pathname); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/liveshow/edit/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.deepEqual(result.message.edits, plan.edits); assert.equal(result.message.baseRevision, 3);
});

// Captured from the first real GPT-4.1 Mini request: valid JSON, wrong fluent-call shape.
test('shorthand model calls are rejected instead of silently changing the chart', async () => {
 const shorthand = { explanation: 'Show profit', edits: [{ y: 'profit', args: [{ type: 'quantitative' }] }, { sort: 'profit', args: ['descending'] }, { color: ['#4269d0'] }] };
 await assert.rejects(generateEdit(input, { key: 'test-only', fetchImpl: async () => Response.json({ choices: [{ message: { content: JSON.stringify(shorthand) } }] }) }), /complete JSON/);
});

test('reset, undo and redo are supported application actions without invented edit methods', async () => {
 for (const action of ['reset', 'undo', 'redo']) {
  const result = await generateEdit({ ...input, prompt: action }, { key: 'test-only', fetchImpl: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ action, explanation: action, edits: [] }) } }] }) });
  assert.equal(result.action, action); assert.equal(result.message, null);
  await assert.rejects(validatePlan({ ...plan, action }, validateInput(input)), /Invalid application action/);
 }
});
