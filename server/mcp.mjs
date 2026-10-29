import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** A real MCP server over a caller-owned browser bridge. No rendering or private VisDelta imports. */
export function createChartMcpServer(bridge) {
  const server = new McpServer({ name: 'visdelta-liveshow', version: '0.2.0' });
  const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  server.registerTool('get_chart_state', { description: 'Read the accepted chart declaration, revision and source rows.', inputSchema: {} }, async () => text(await bridge.state()));
  server.registerTool('inspect_marks', { description: 'Read visible keyed marks with data, pixel bounds and explicit left-to-right/top-to-bottom ordering. Inspect before referring to ordinal positions.', inputSchema: {} }, async () => text(await bridge.inspect()));
  server.registerTool('capture_chart', { description: 'See the actual chart as a PNG image. Use only when image-based visual inspection is needed or explicitly requested. Prefer state/mark data for ordinary edits and simple ordinal references.', inputSchema: {} }, async () => {
    const image = await bridge.capture();
    return { content: [{ type: 'text', text: JSON.stringify({ revision: image.revision, width: image.width, height: image.height }) }, { type: 'image', mimeType: 'image/png', data: image.dataUrl.split(',')[1] }] };
  });
  server.registerTool('edit_chart', { description: 'Apply supported VisDelta fluent edits to the current revision. Use structured field/value/selector properties, never JSON-encoded argument strings. Combine all compatible edits into one batch. The browser receipt verifies execution and normally ends the turn. Set continueAfterApply only when a later operation depends on inspecting the newly changed chart.', inputSchema: {
    summary: z.string().max(300).optional(), continueAfterApply: z.boolean().optional(),
    revision: z.number().int().nonnegative(), edits: z.array(z.union([
      z.object({ method: z.enum(['x', 'y']), field: z.string().min(1), type: z.enum(['nominal', 'quantitative', 'temporal', 'ordinal']).optional(), label: z.string().optional(), format: z.string().optional() }),
      z.object({ method: z.literal('sort'), field: z.string().min(1), direction: z.enum(['ascending', 'descending']) }),
      z.object({ method: z.literal('color'), value: z.string().min(1).describe('A fixed CSS color, e.g. blue, coral or #4269d0; converted to a literal by the tool.') }),
      z.object({ method: z.literal('flip') }),
      z.object({ method: z.enum(['where', 'focus', 'highlight']), selector: z.record(z.string(), z.union([
        z.string(), z.number(), z.boolean(), z.null(),
        z.object({ gt: z.number().optional(), gte: z.number().optional(), lt: z.number().optional(), lte: z.number().optional(), eq: z.union([z.string(), z.number()]).optional(), ne: z.union([z.string(), z.number()]).optional(), in: z.array(z.union([z.string(), z.number()])).optional() }),
      ])) }),
    ])).min(1).max(8),
  } }, async args => text(await bridge.edit(args)));
  server.registerTool('restore_chart', { description: 'Reset to initial chart or undo/redo the last change. Revision must match the observed chart.', inputSchema: { summary: z.string().max(300).optional(), revision: z.number().int().nonnegative(), action: z.enum(['reset', 'undo', 'redo']) } }, async args => text(await bridge.restore(args)));
  server.registerTool('ask_user', { description: 'Ask a concise clarification when the intended mark, direction, measure or operation is ambiguous. Do not edit while waiting for the answer.', inputSchema: { question: z.string().min(1).max(1200) } }, async args => text(await bridge.ask(args.question)));
  return server;
}
