import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRunner } from '../../server/agent.mjs';
import { initialSpec } from '../../components/liveshow/presets.ts';
const input = { prompt: '高亮第三根柱子', revision: 0, spec: initialSpec,
 capture: { revision: 0, mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 600, height: 340 },
 observation: { revision: 0, marks: [{ id: 'third', data: { product: 'Atlas' } }], orders: { leftToRight: ['first', 'second', 'third'] } } };
function call(name, args = {}) { return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }); }
test('agent uses real MCP tools, forwards images, waits for actual browser receipt and verifies', async () => {
 let step = 0;
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  const request = JSON.parse(init.body); const index = step++;
  assert.equal('parallel_tool_calls' in request, false, 'Do not require an unsupported provider routing parameter');
  assert.ok(request.tools.some(tool => tool.function.name === 'capture_chart'));
  if (index === 0) return call('get_chart_state');
  if (index === 1) return call('capture_chart');
  if (index === 2) { assert.ok(request.messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'image_url'))); return call('inspect_marks'); }
  if (index === 3) return call('edit_chart', { revision: 0, edits: [{ method: 'highlight', arguments: '[{"product":"Atlas"}]' }] });
  if (index === 4) { assert.ok(request.messages.some(message => message.role === 'tool' && message.content.includes('applied'))); return call('capture_chart'); }
  return Response.json({ choices: [{ message: { content: '已高亮 Atlas。' } }] });
 } });
 const pending = await run(input, { key: 'test-only', model: 'test' });
 assert.equal(pending.command.message.edits[0].args[0].product, 'Atlas');
 assert.equal(pending.toolCallId, 'call-edit_chart');
 const done = await run({ ...input, revision: 1, capture: { ...input.capture, revision: 1 }, observation: { ...input.observation, revision: 1 }, sessionId: pending.sessionId, toolCallId: pending.toolCallId, receipt: { status: 'applied', revision: 1 } }, { key: 'test-only' });
 assert.equal(done.explanation, '已高亮 Atlas。'); assert.equal(step, 6);
});
test('ask_user ends the turn without any browser mutation', async () => {
 const run = createAgentRunner({ fetchImpl: async () => call('ask_user', { question: '你想改哪根柱子，以及怎么改？' }) });
 const result = await run({ ...input, prompt: '把那个改一下' }, { key: 'test-only' });
 assert.equal(result.question, true); assert.equal(result.command, undefined); assert.match(result.explanation, /哪根/);
});
test('outdated observations are rejected before a model call', async () => {
 const run = createAgentRunner({ fetchImpl: () => { throw new Error('must not call'); } });
 await assert.rejects(run({ ...input, capture: { ...input.capture, revision: 99 } }, { key: 'test-only' }), /current chart capture/);
});
test('multiple read tools are serialized over MCP before forwarding an image', async () => {
 let n = 0;
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  if (!n++) return Response.json({ choices: [{ message: { content: null, tool_calls: ['get_chart_state','capture_chart','inspect_marks'].map(name => ({ id: name, type: 'function', function: { name, arguments: '{}' } })) } }] });
  const request = JSON.parse(init.body);
  assert.equal(request.messages.filter(message => message.role === 'tool').length, 3);
  assert.ok(request.messages.at(-1).content.some(block => block.type === 'image_url'));
  return Response.json({ choices: [{ message: { content: 'Observed.' } }] });
 } });
 assert.equal((await run(input, { key: 'test-only' })).explanation, 'Observed.');
});
