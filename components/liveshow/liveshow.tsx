'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChartView, UpdateResult } from 'visdelta/render';
import { categories } from '@/examples/registry';
import { initialSpec, liveshowPresets, presetEdits, sales } from './presets';

type Receipt = { id: number; label: string; status: UpdateResult['status'] | 'submitted' | 'rejected' };
const json = (spec: unknown) => JSON.stringify(spec, null, 2);

export function Liveshow() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ChartView | null>(null);
  const nextId = useRef(0);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState('encoding');
  const [draft, setDraft] = useState(() => json({ requestId: 'edit-initial', baseRevision: 0, edits: presetEdits('encoding') }));
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
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

  async function submit(text: string, label: string, complete = false) {
    const current = view.current;
    if (!current) return;
    const id = ++nextId.current;
    setError('');
    setReceipts(items => [{ id, label, status: 'submitted' as const }, ...items].slice(0, 8));
    try {
      const settings = { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches };
      const result = await (complete ? current.update(text, settings) : current.edit(text, settings));
      if (view.current !== current) return;
      setRevision(current.snapshot().revision);
      setReceipts(items => items.map(item => item.id === id ? { ...item, status: result.status } : item));
    } catch (reason) {
      if (view.current !== current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setReceipts(items => items.map(item => item.id === id ? { ...item, status: 'rejected' } : item));
    }
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-fd-muted-foreground">AI / live visualization</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Liveshow</h1>
          <p className="mt-2 max-w-xl text-sm text-fd-muted-foreground">A small JSON edit. An existing chart. The same chart, changing in place.</p>
        </div>
        <span className="rounded-sm border px-3 py-1.5 text-xs text-fd-muted-foreground">Local presets · no AI connected</span>
      </header>

      <section aria-label="Example instructions" className="rounded-sm border bg-fd-card">
        <nav aria-label="State-change categories" className="flex flex-wrap gap-1 border-b p-2">
          {categories.map(category => <button key={category.id} type="button" aria-pressed={selected === category.id}
            className="rounded-sm px-3 py-2 text-xs text-fd-muted-foreground hover:text-fd-foreground aria-pressed:bg-fd-accent aria-pressed:text-fd-foreground"
            onClick={() => { setSelected(category.id); setDraft(category.id === 'grain' ? json(liveshowPresets[1].spec) : message(category.id)); }}>
            {category.label}
          </button>)}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="mb-1 text-xs text-fd-muted-foreground">Try an instruction</p><p className="text-sm">“{preset.prompt}”</p></div>
          <button type="button" className="pg-tool pg-tool-primary" disabled={!ready} onClick={() => { const text = selected === 'grain' ? json(preset.spec) : message(selected); setDraft(text); void submit(text, preset.prompt, selected === 'grain'); }}>Send preset</button>
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[230px_minmax(280px,0.9fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="liveshow-data" className="min-w-0 rounded-sm border bg-fd-card p-4">
          <h2 id="liveshow-data" className="text-sm font-medium">01 / Source data</h2>
          <p className="mt-1 text-xs text-fd-muted-foreground">Illustrative sales · amounts in $k</p>
          <table className="mt-5 w-full text-left text-xs">
            <thead><tr className="border-b text-fd-muted-foreground"><th className="pb-2 font-normal">Product</th><th className="pb-2 text-right font-normal">Revenue</th><th className="pb-2 text-right font-normal">Profit</th></tr></thead>
            <tbody>{sales.map(row => <tr key={row.product} className="border-b last:border-0"><th scope="row" className="py-3 font-normal">{row.product}</th><td className="text-right tabular-nums">{row.revenue}</td><td className="text-right tabular-nums">{row.profit}</td></tr>)}</tbody>
          </table>
          <p className="mt-5 text-xs leading-relaxed text-fd-muted-foreground">Edits build on the accepted chart. Filters and highlights accumulate. Reset restores the original chart. Grain uses a complete state replacement.</p>
        </section>

        <section aria-labelledby="liveshow-spec" className="flex min-w-0 flex-col rounded-sm border bg-fd-card">
          <div className="border-b p-4"><h2 id="liveshow-spec" className="text-sm font-medium">02 / Fluent JSON edit</h2><p className="mt-1 text-xs text-fd-muted-foreground">{selected === 'grain' ? 'Grain: complete state via update().' : 'Edit commands, then send via edit(). Resending the same request is safe.'}</p></div>
          <textarea aria-label="Next chart JSON" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void submit(draft, 'Custom JSON', selected === 'grain'); } }}
            className="min-h-[340px] w-full flex-1 resize-y bg-transparent p-4 font-mono text-xs leading-5 outline-offset-[-2px]" />
          <div className="flex justify-between gap-2 border-t p-3"><button type="button" className="pg-tool" disabled={!ready} onClick={() => { void submit(json(initialSpec), 'Reset to revenue', true).then(() => { if (view.current) setDraft(selected === 'grain' ? json(preset.spec) : message(selected)); }); }}>Reset</button><button type="button" className="pg-tool pg-tool-primary" disabled={!ready} onClick={() => void submit(draft, 'Custom JSON', selected === 'grain')}>Send JSON</button></div>
      {error ? <p role="alert" className="break-words rounded-sm border border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </section>

        <section aria-labelledby="liveshow-chart" className="min-w-0 rounded-sm border bg-fd-card">
          <div className="flex items-center justify-between gap-2 border-b p-4"><h2 id="liveshow-chart" className="text-sm font-medium">03 / Live chart</h2><span role="status" className="text-xs text-fd-muted-foreground">{ready ? `Ready · revision ${revision}` : 'Preparing chart…'}</span></div>
          <div ref={host} className="liveshow-chart min-h-[380px] p-3" />
          <div className="border-t p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium">Change your mind, quickly.</h3><p className="mt-1 text-xs text-fd-muted-foreground">Three accepted edits. Keep their changes; skip superseded pending animations.</p></div><button type="button" className="pg-tool" disabled={!ready} onClick={burst}>Send burst</button></div>
            <ol aria-label="Update results" className="mt-4 space-y-2 text-xs">
              {receipts.length === 0 ? <li className="text-fd-muted-foreground">Send an instruction to see its result here.</li> : receipts.map(item => <li key={item.id} className="flex items-center justify-between gap-3 border-t pt-2"><span className="min-w-0 truncate"><span className="mr-2 text-fd-muted-foreground">{item.id.toString().padStart(2, '0')}</span>{item.label}</span><span className="font-mono text-fd-muted-foreground">{item.status}</span></li>)}
            </ol>
          </div>
        </section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-fd-muted-foreground"><code>await view.edit(message)</code><a href="https://songhaifan.github.io/visdelta/docs/guides/json/" className="underline underline-offset-4">Build this into your agent →</a></footer>
    </div>
  );
}
