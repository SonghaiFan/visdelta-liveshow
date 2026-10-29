import { bar } from 'visdelta/bar';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRunner } from '../../server/agent.mjs';
import { initialSpec } from '../../components/liveshow/presets.ts';
const input = { prompt: '高亮第三根柱子', revision: 0, spec: initialSpec,
 capture: { revision: 0, mimeType: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 600, height: 340 },
 observation: { revision: 0, marks: [{ id: 'third', data: { product: 'Atlas' } }], orders: { leftToRight: ['first', 'second', 'third'] } } };
const base = bar({ name: 'sales' }).x('product').y('revenue', { label: 'Revenue ($k)' });
const highlighted = base.highlight({ product: 'Atlas' }).toSpec();
function call(name, args = {}) {
 if (name === 'edit_chart') args = { ...args, edits: args.edits.map(edit => {
  if (!('arguments' in edit)) return edit;
  const values = JSON.parse(edit.arguments);
  if (edit.method === 'x' || edit.method === 'y') return { method: edit.method, field: values[0], ...(values[1] ?? {}) };
  if (edit.method === 'sort') return { method: edit.method, field: values[0], direction: values[1] };
  if (edit.method === 'color') return { method: edit.method, value: values[0] };
  if (edit.method === 'flip') return { method: edit.method };
  return { method: edit.method, selector: values[0] };
 }) };
 return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }); }
test('agent uses real MCP tools, forwards images, waits for actual browser receipt and verifies', async () => {
 let step = 0;
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  const request = JSON.parse(init.body); const index = step++;
  assert.equal('parallel_tool_calls' in request, false, 'Do not require an unsupported provider routing parameter');
  assert.ok(request.tools.some(tool => tool.function.name === 'capture_chart'));
  if (index === 0) return call('get_chart_state');
  if (index === 1) return call('capture_chart');
  if (index === 2) { assert.ok(request.messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'image_url'))); return call('inspect_marks'); }
  if (index === 3) return call('edit_chart', { summary: '已高亮 Atlas。', revision: 0, edits: [{ method: 'highlight', arguments: '[{"product":"Atlas"}]' }] });
  if (index === 4) { assert.ok(request.messages.some(message => message.role === 'tool' && message.content.includes('applied'))); return call('capture_chart'); }
  return Response.json({ choices: [{ message: { content: '已高亮 Atlas。' } }] });
 } });
 const pending = await run(input, { key: 'test-only', model: 'test' });
 assert.equal(pending.command.message.edits[0].args[0].product, 'Atlas');
 assert.equal(pending.toolCallId, 'call-edit_chart');
 const done = await run({ ...input, spec: highlighted, revision: 1, capture: { ...input.capture, revision: 1 }, observation: { ...input.observation, revision: 1 }, sessionId: pending.sessionId, toolCallId: pending.toolCallId, receipt: { status: 'applied', revision: 1 } }, { key: 'test-only' });
 assert.equal(done.explanation, '已高亮 Atlas。'); assert.equal(step, 4);
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
test('reasoning effort is explicit and opaque reasoning metadata survives tool continuation', async () => {
 let step = 0;
 const signature = [{ type: 'reasoning.encrypted', data: 'synthetic-opaque-signature' }];
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  const body = JSON.parse(init.body);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  if (!step++) return Response.json({ choices: [{ message: { content: null, reasoning_details: signature, tool_calls: [{ id: 'state', type: 'function', function: { name: 'get_chart_state', arguments: '{}' } }] } }] });
  assert.deepEqual(body.messages.find(item => item.role === 'assistant').reasoning_details, signature);
  return Response.json({ choices: [{ message: { content: 'Observed.' } }] });
 } });
 const result = await run(input, { key: 'test-only', model: 'test', reasoningEffort: 'low' });
 assert.equal(result.explanation, 'Observed.');
 assert.equal('reasoning_details' in result, false);
});
test('ordinary named edits work without any screenshot or image input', async () => {
 let step = 0;
 const noImage = { ...input, prompt: '高亮 Atlas', capture: undefined };
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  const request = JSON.parse(init.body);
  assert.ok(!request.messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'image_url')));
  assert.equal(step++, 0, 'A successful receipt must not cause another model call');
  assert.equal(JSON.parse(request.messages.at(-1).content).chart.revision, 0);
  return call('edit_chart', { summary: 'Applied without vision.', revision: 0, edits: [{ method: 'highlight', arguments: '[{"product":"Atlas"}]' }] });
 } });
 const pending = await run(noImage, { key: 'test-only' });
 assert.equal(pending.command.action, 'edit');
 const result = await run({ ...noImage, spec: highlighted, revision: 1, observation: { ...input.observation, revision: 1 }, sessionId: pending.sessionId, toolCallId: pending.toolCallId, receipt: { status: 'applied' } }, { key: 'test-only' });
 assert.equal(result.explanation, 'Applied without vision.');
});
test('image tool pauses for a browser capture and only then forwards the PNG', async () => {
 let step = 0;
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  const request = JSON.parse(init.body);
  if (!step++) {
   assert.ok(!request.messages.some(message => Array.isArray(message.content)));
   return call('capture_chart');
  }
  assert.ok(request.messages.at(-1).content.some(block => block.type === 'image_url'));
  return Response.json({ choices: [{ message: { content: 'I can see the chart now.' } }] });
 } });
 const pending = await run({ ...input, capture: undefined }, { key: 'test-only' });
 assert.equal(pending.command.action, 'capture'); assert.equal(step, 1);
 const result = await run({ ...input, sessionId: pending.sessionId, toolCallId: pending.toolCallId, receipt: { status: 'applied' } }, { key: 'test-only' });
 assert.equal(result.explanation, 'I can see the chart now.'); assert.equal(step, 2);
});
test('repeated invalid edits stop instead of burning the full tool budget', async () => {
 let calls = 0;
 const run = createAgentRunner({ fetchImpl: async () => {
  if (!calls++) return call('get_chart_state');
  return call('edit_chart', { revision: 0, edits: [{ method: 'y', arguments: '["nonexistent"]' }] });
 } });
 const result = await run(input, { key: 'test-only' });
 assert.ok(calls <= 3, `provider was called ${calls} times`);
 assert.ok(result.trace.some(entry => entry.status === 'error'));
 assert.doesNotMatch(result.explanation, /tool-step limit/);
});
test('one corrected edit is allowed and the actual validator reason is returned', async () => {
 let calls = 0;
 const run = createAgentRunner({ fetchImpl: async (_url, init) => {
  const request = JSON.parse(init.body);
  if (calls++) assert.match(request.messages.at(-1).content, /nonexistent/);
  return call('edit_chart', { summary: 'Blue bars.', revision: 0, edits: calls === 1 ? [{ method: 'y', field: 'nonexistent' }] : [{ method: 'color', value: '#4269d0' }] });
 } });
 const pending = await run(input, { key: 'test-only' });
 assert.equal(calls, 2); assert.equal(pending.trace[0].status, 'error');
 const done = await run({ ...input, spec: base.color('#4269d0').toSpec(), revision: 1, capture: undefined, observation: { ...input.observation, revision: 1 }, sessionId: pending.sessionId, toolCallId: pending.toolCallId, receipt: { status: 'applied', revision: 1 } }, { key: 'test-only' });
 assert.equal(done.explanation, 'Blue bars.'); assert.equal(calls, 2);
});
test('dependent edits can explicitly continue, but finish after the second accepted batch', async () => {
 let calls = 0;
 const run = createAgentRunner({ fetchImpl: async () => ++calls === 1
  ? call('edit_chart', { revision: 0, continueAfterApply: true, edits: [{ method: 'sort', arguments: '["revenue","descending"]' }] })
  : call('edit_chart', { summary: 'Sorted and highlighted.', revision: 1, continueAfterApply: true, edits: [{ method: 'highlight', arguments: '[{"product":"Atlas"}]' }] }) });
 const first = await run(input, { key: 'test-only' });
 const sorted = base.sort('revenue', 'descending');
 const next = await run({ ...input, spec: sorted.toSpec(), revision: 1, capture: undefined, observation: { ...input.observation, revision: 1 }, sessionId: first.sessionId, toolCallId: first.toolCallId, receipt: { status: 'applied' } }, { key: 'test-only' });
 const done = await run({ ...input, spec: sorted.highlight({ product: 'Atlas' }).toSpec(), revision: 2, capture: undefined, observation: { ...input.observation, revision: 2 }, sessionId: next.sessionId, toolCallId: next.toolCallId, receipt: { status: 'applied' } }, { key: 'test-only' });
 assert.equal(done.explanation, 'Sorted and highlighted.'); assert.equal(calls, 2);
});
test('a claimed success with the wrong chart state is not reported as applied', async () => {
 const run = createAgentRunner({ fetchImpl: async () => call('edit_chart', { revision: 0, edits: [{ method: 'highlight', arguments: '[{"product":"Atlas"}]' }] }) });
 const pending = await run(input, { key: 'test-only' });
 const done = await run({ ...input, revision: 1, capture: undefined, observation: { ...input.observation, revision: 1 }, sessionId: pending.sessionId, toolCallId: pending.toolCallId, receipt: { status: 'applied' } }, { key: 'test-only' });
 assert.match(done.explanation, /does not match/);
});
test('compound structured tool arguments compile into one validated VisDelta batch', async () => {
 const run = createAgentRunner({ fetchImpl: async () => call('edit_chart', { summary: 'Profit sorted in blue.', revision: 0, edits: [
  { method: 'y', field: 'profit', type: 'quantitative' },
  { method: 'sort', field: 'profit', direction: 'descending' },
  { method: 'color', value: '#4269d0' },
 ] }) });
 const result = await run(input, { key: 'test-only' });
 assert.deepEqual(result.command.message.edits, [
  { method: 'y', args: ['profit', { type: 'quantitative' }] },
  { method: 'sort', args: ['profit', 'descending'] },
  { method: 'color', args: ['#4269d0'] },
 ]);
 assert.deepEqual(result.trace.map(entry => entry.tool), ['edit_chart']);
});

test('named colors are compiled to literal colors without a model retry', async () => {
 let calls = 0;
 const run = createAgentRunner({ fetchImpl: async () => { calls++; return call('edit_chart', { revision: 0, edits: [{ method: 'color', value: 'blue' }] }); } });
 const result = await run(input, { key: 'test-only' });
 assert.equal(calls, 1); assert.deepEqual(result.command.message.edits, [{ method: 'color', args: ['#0000ff'] }]);
});
