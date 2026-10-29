'use client';

import { useEffect, useRef, useState } from 'react';
import type { ViewSpec } from 'visdelta/core';
import { delta } from 'visdelta/core';
import type { ChartView, UpdateResult } from 'visdelta/render';
import { categories } from '@/examples/registry';
import { initialSpec, liveshowPresets, presetEdits, sales } from './presets';

type Receipt = { id: number; label: string; status: UpdateResult['status'] | 'submitted' | 'rejected' };
const json = (spec: unknown) => JSON.stringify(spec, null, 2);

export function Liveshow() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ChartView | null>(null);
  const past = useRef<ViewSpec[]>([]);
  const future = useRef<ViewSpec[]>([]);
  const [history, setHistory] = useState({ past: 0, future: 0 });
  const activeUpdates = useRef(0);
  const [updating, setUpdating] = useState(false);
  function refreshHistory() { setHistory({ past: past.current.length, future: future.current.length }); }
  const [restoring, setRestoring] = useState(false);
  const historyLock = useRef(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const nextId = useRef(0);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState('encoding');
  const [draft, setDraft] = useState(() => json({ requestId: 'edit-initial', baseRevision: 0, edits: presetEdits('encoding') }));
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [connection, setConnection] = useState('Checking local AI…');
  const [aiReady, setAiReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [duration, setDuration] = useState(550);
  const [changes, setChanges] = useState<string[]>([]);
  const [chat, setChat] = useState<{ id: number; prompt: string; reply: string; tools?: string[] }[]>([]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [chat]);
  const pending = useRef<AbortController | null>(null);
  const aiId = useRef(0);
  const api = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/liveshow`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/status/`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const status = await response.json();
      setAiReady(status.configured === true);
      setConnection(status.configured ? `OpenRouter · ${status.model}` : 'Add your key to .env.local, then restart');
    }).catch(() => { if (!controller.signal.aborted) setConnection('AI is available in the local app'); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [api]);
  const preset = liveshowPresets.find(item => item.category === selected)!;

  useEffect(() => {
    let disposed = false;
    let owned: ChartView | undefined;
    const mount = document.createElement('div');
    host.current!.append(mount);
    void (async () => {
      const [{ createRenderer }, { barModule }] = await Promise.all([import('visdelta/render'), import('visdelta/bar')]);
      if (disposed) return;
      owned = await createRenderer({ modules: [barModule] }).render(mount, initialSpec, {
        data: { sales }, height: 340, updates: { policy: 'latest', duration: 550 },
      });
      if (disposed) { owned.destroy(); return; }
      view.current = owned;
      setReady(true);
    })().catch(reason => { if (!disposed) setError(String(reason instanceof Error ? reason.message : reason)); });
    return () => {
      disposed = true;
      if (view.current === owned) view.current = null;
      owned?.destroy();
      mount.remove();
    };
  }, []);

  async function submit(text: string, label: string, complete = false, recordHistory = true) {
    const current = view.current;
    if (!current || (historyLock.current && recordHistory)) return;
    activeUpdates.current++; setUpdating(true);
    const id = ++nextId.current;
    setError('');
    setReceipts(items => [{ id, label, status: 'submitted' as const }, ...items].slice(0, 8));
    try {
      const beforeSnapshot = current.snapshot();
      const before = beforeSnapshot.spec;
      const settings = { duration, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches };
      const result = await (complete ? current.update(text, settings) : current.edit(text, settings));
      if (view.current !== current) return;
      if (recordHistory && result.revision !== undefined && result.revision > beforeSnapshot.revision) {
        past.current = [...past.current, before].slice(-40); future.current = [];
        refreshHistory();
      }
      setRevision(current.snapshot().revision);
      setChanges(delta(before, current.snapshot().spec).stateChanges.map(change => `${change.category}.${change.action}`));
      setReceipts(items => items.map(item => item.id === id ? { ...item, status: result.status } : item));
      return result;
    } catch (reason) {
      if (view.current !== current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setReceipts(items => items.map(item => item.id === id ? { ...item, status: 'rejected' } : item));
    } finally { activeUpdates.current--; setUpdating(activeUpdates.current > 0); }
  }

  async function restore(action: 'reset' | 'undo' | 'redo', label = action as string) {
    const current = view.current;
    if (!current || historyLock.current || activeUpdates.current > 0) return;
    const target = action === 'reset' ? initialSpec : action === 'undo' ? past.current.at(-1) : future.current.at(-1);
    if (!target) return;
    historyLock.current = true; setRestoring(true);
    const before = current.snapshot().spec;
    try {
      const result = await submit(json(target), label, true, false);
      if (result?.status === 'applied') {
        if (action === 'undo') { past.current.pop(); future.current.push(before); }
        else if (action === 'redo') { future.current.pop(); past.current.push(before); }
        else { past.current = [...past.current, before].slice(-40); future.current = []; }
        refreshHistory();
        setDraftComplete(true); setSelected('ai'); setDraft(json(target));
      }
      return result;
    } finally { historyLock.current = false; setRestoring(false); }
  }

  function message(category: string) {
    const snapshot = view.current?.snapshot();
    return json({ requestId: crypto.randomUUID(), baseRevision: snapshot?.revision ?? 0,
      edits: presetEdits(category, snapshot?.spec) });
  }

  async function burst() {
    const current = view.current;
    if (!current) return;
    for (const [label, edits] of [
      ['Show profit', presetEdits('encoding', current.snapshot().spec)],
      ['Use blue', [{ method: 'color', args: ['#4269d0'] }]],
      ['Actually, use coral', [{ method: 'color', args: ['#ff725c'] }]],
    ] as const) {
      if (view.current !== current) return;
      const baseRevision = current.snapshot().revision;
      const text = json({ requestId: crypto.randomUUID(), baseRevision, edits });
      setDraft(text);
      let finished = false;
      const completion = submit(text, label).finally(() => { finished = true; });
      // Wait for acceptance, not animation. Each next edit includes earlier intent.
      while (!finished && view.current === current && current.snapshot().revision === baseRevision) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      if (view.current !== current) return;
      setRevision(current.snapshot().revision);
      void completion;
    }
  }

  async function ask() {
    const current = view.current;
    if (!current || !prompt.trim() || !aiReady) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const id = ++aiId.current;
    const text = prompt.trim();
    setPrompt(''); setThinking(true);
    setChat(items => [...items.map(item => item.reply === 'Thinking…' ? { ...item, reply: 'Replaced by your next request.' } : item), { id, prompt: text, reply: 'Thinking…' }].slice(-12));
    const reply = (value: string) => setChat(items => items.map(item => item.id === id ? { ...item, reply: value } : item));
    try {
      let continuation: { sessionId?: string; toolCallId?: string; receipt?: { status: string; revision?: number } } = {};
      const tools: string[] = [];
      let requestedCapture: Awaited<ReturnType<ChartView['capture']>> | undefined;
      for (let step = 0; step < 8; step++) {
        if (controller.signal.aborted || view.current !== current) return;
        const observed = current.inspectMarks();
        const sent = current.snapshot();
        if (sent.revision !== observed.revision || (requestedCapture && sent.revision !== requestedCapture.revision)) throw new Error('Chart changed during observation. Send your request again.');
        const response = await fetch(`${api}/agent/`, { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }, body: json({ prompt: text, ...sent, ...(requestedCapture ? { capture: requestedCapture } : {}), observation: observed, history: chat.slice(-8), ...continuation }) });
        const result = await response.json();
        requestedCapture = undefined;
        if (!response.ok) throw new Error(result.error || 'The agent request failed.');
        if (controller.signal.aborted || view.current !== current) return;
        tools.push(...(result.trace ?? []).map((entry: { tool: string }) => entry.tool));
        setChat(items => items.map(item => item.id === id ? { ...item, tools: [...tools] } : item));
        if (current.snapshot().revision !== sent.revision) {
          reply('The chart changed while I was thinking. Please send your request again against the current view.'); return;
        }
        const operation = result.command ?? result;
        if (operation.action === 'capture') {
          reply('Capturing the chart for visual inspection…');
          requestedCapture = await current.capture();
          continuation = { sessionId: result.sessionId, toolCallId: result.toolCallId, receipt: { status: 'applied', revision: current.snapshot().revision } };
          continue;
        }
        let applied: UpdateResult | undefined;
        if (['reset', 'undo', 'redo'].includes(operation.action)) {
          const action = operation.action as 'reset' | 'undo' | 'redo';
          if ((action === 'undo' && !past.current.length) || (action === 'redo' && !future.current.length)) {
            if (!result.command) { reply(action === 'undo' ? 'There is no earlier chart state to undo.' : 'There is no undone chart state to redo.'); return; }
          } else applied = await restore(action, text);
        } else if (operation.message) {
          setSelected('ai'); setDraftComplete(false); setDraft(json(operation.message));
          applied = await submit(json(operation.message), text);
        } else { reply(result.explanation || 'No chart changes made.'); return; }
        if (controller.signal.aborted) return;
        if (!result.sessionId) {
          reply(applied?.status === 'applied' ? result.explanation : 'The requested chart update was not applied.'); return;
        }
        reply(applied?.status === 'applied' ? 'Checking the updated chart…' : 'The tool could not apply the change; checking the result…');
        continuation = { sessionId: result.sessionId, toolCallId: result.toolCallId,
          receipt: { status: applied?.status === 'applied' ? 'applied' : applied?.status === 'superseded' ? 'superseded' : 'failed', revision: current.snapshot().revision } };
      }
      reply('Reached the tool limit. Please narrow your request.');
    } catch (reason) {
      if (!controller.signal.aborted) reply(reason instanceof Error ? reason.message : 'Unable to reach the local AI service.');
    } finally {
      if (pending.current === controller) { pending.current = null; setThinking(false); }
    }
  }
  function cancelAI() {
    pending.current?.abort(); pending.current = null; setThinking(false);
    setChat(items => items.map(item => item.reply === 'Thinking…' ? { ...item, reply: 'Cancelled.' } : item));
  }

  return (
    <div className="live-workspace">
      <div className="live-toolbar">
        <div className="flex gap-1">
          <button type="button" className="pg-tool" disabled={!ready || restoring || updating || !history.past} onClick={() => { cancelAI(); void restore('undo'); }}>Undo</button>
          <button type="button" className="pg-tool" disabled={!ready || restoring || updating || !history.future} onClick={() => { cancelAI(); void restore('redo'); }}>Redo</button>
          <button type="button" className="pg-tool" disabled={!ready || restoring || updating} onClick={() => { cancelAI(); void restore('reset'); }}>Reset</button>
        </div>
        <div><h1>Liveshow</h1><p>Think out loud. Change the view.</p></div>
        <span role="status">{ready ? `Ready · revision ${revision}` : 'Preparing chart…'}</span>
        <label className="live-speed">Motion <select aria-label="Transition speed" value={duration} onChange={event => setDuration(Number(event.target.value))}><option value={250}>Quick</option><option value={550}>Natural</option><option value={1000}>Slow</option></select></label>
      </div>

      <div className="live-stage-layout">
        <section className="live-stage" aria-label="Presentation canvas">
          <div className="live-slide-heading"><span className="live-kicker">01 / A live data conversation</span><h2>A different view of sales.</h2><p>Four products. Revenue and profit, in thousands of dollars.</p></div>
          <div ref={host} className="liveshow-chart live-canvas" />
          <div className="live-slide-footer"><span>Illustrative sales data</span><span>Powered by VisDelta</span></div>
        </section>

        <aside className="live-conversation" aria-label="Chart conversation">
          <div className="live-chat-heading"><div><h2>Talk to the chart</h2><p>{connection}</p></div><span className={`live-dot ${aiReady ? 'is-ready' : ''}`} aria-hidden="true" /></div>
          <div ref={log} className="live-chat-log" role="log" aria-label="Conversation history" aria-live="polite">
            {chat.length === 0 ? <div className="live-chat-empty"><p>What would you like to show?</p><span>Try “Show profit instead of revenue, rank highest first, and use blue bars.”</span></div> : chat.map(item => <div key={item.id} className="live-chat-turn"><p className="live-user-message">{item.prompt}</p><p className="live-assistant-message">{item.reply}</p>{!!item.tools?.length && <p className="live-changes" aria-label="Agent tools">{item.tools.join(' → ')}</p>}</div>)}
          </div>
          <form onSubmit={event => { event.preventDefault(); void ask(); }} className="live-composer">
            <label htmlFor="chart-prompt" className="sr-only">Describe a chart change</label>
            <textarea id="chart-prompt" maxLength={2000} rows={3} placeholder="Show profit, highlight Beacon…" value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} />
            <div><span>{thinking ? 'Thinking · send again to change direction' : 'Enter to send · Shift + Enter for a new line'}</span>{thinking && <button type="button" className="pg-tool" onClick={cancelAI}>Cancel</button>}<button className="pg-tool pg-tool-primary" disabled={!ready || !aiReady || !prompt.trim()} type="submit">Send</button></div>
          </form>
          {!aiReady && <p className="live-local-note">Run this app locally with your OpenRouter key to use AI. The presets below work everywhere.</p>}
        </aside>
      </div>

      <details className="live-inspector">
        <summary>Explore presets, data &amp; generated edits</summary>
        <div className="live-inspector-content">
          <section aria-label="Example instructions">
            <nav aria-label="State-change categories" className="live-categories">{categories.map(category => <button key={category.id} type="button" aria-pressed={selected === category.id} className="pg-tool" onClick={() => { setSelected(category.id); setDraftComplete(category.id === 'grain'); setDraft(category.id === 'grain' ? json(liveshowPresets[1].spec) : message(category.id)); }}>{category.label}</button>)}</nav>
            <div className="live-preset"><p>“{preset?.prompt ?? 'Your AI-generated edit'}”</p><button type="button" className="pg-tool pg-tool-primary" disabled={!ready || !preset} onClick={() => { if (!preset) return; const text = selected === 'grain' ? json(preset.spec) : message(selected); setDraftComplete(selected === 'grain'); setDraft(text); void submit(text, preset.prompt, selected === 'grain'); }}>Send preset</button></div>
          </section>
          <div className="live-inspector-grid">
            <section><h2>Source data</h2><table className="w-full text-left text-xs"><thead><tr><th>Product</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>{sales.map(row => <tr key={row.product}><th scope="row">{row.product}</th><td>{row.revenue}</td><td>{row.profit}</td></tr>)}</tbody></table></section>
            <section><h2>Fluent JSON edit</h2><textarea aria-label="Next chart JSON" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} className="live-json" /><div className="live-editor-actions"><span>{draftComplete ? 'Complete chart · update()' : 'Incremental edit · edit()'}</span><button type="button" className="pg-tool pg-tool-primary" disabled={!ready} onClick={() => void submit(draft, 'Custom JSON', draftComplete)}>Send JSON</button></div><p className="live-changes">{changes.join(' · ') || 'Send an instruction to inspect its state changes.'}</p></section>
            <section><h2>Update results</h2><button type="button" className="pg-tool" disabled={!ready} onClick={burst}>Send burst</button><ol aria-label="Update results" className="live-receipts">{receipts.map(item => <li key={item.id}><span>{item.label}</span><code>{item.status}</code></li>)}</ol></section>
          </div>
        </div>
      </details>
      {error && <p role="alert" className="live-error">{error}</p>}
      <footer className="live-footer"><code>await view.edit(message)</code><a href="https://songhaifan.github.io/visdelta/docs/guides/json/">VisDelta API ↗</a></footer>
    </div>
  );
}
