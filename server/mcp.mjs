import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** A real MCP server over a caller-owned browser bridge. No rendering or private VisDelta imports. */
export function createChartMcpServer(bridge) {
  const server = new McpServer({ name: 'visdelta-liveshow', version: '0.2.0' });
  const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  server.registerTool('get_chart_state', { description: 'Read the accepted chart declaration, revision and source rows.', inputSchema: {} }, async () => text(await bridge.state()));
  server.registerTool('inspect_marks', { description: 'Read visible keyed marks with data, pixel bounds and explicit left-to-right/top-to-bottom ordering. Inspect before referring to ordinal positions.', inputSchema: {} }, async () => text(await bridge.inspect()));
  server.registerTool('capture_chart', { description: 'See the actual chart as a PNG image. Capture before interpreting visual or positional instructions.', inputSchema: {} }, async () => {
    const image = await bridge.capture();
    return { content: [{ type: 'text', text: JSON.stringify({ revision: image.revision, width: image.width, height: image.height }) }, { type: 'image', mimeType: 'image/png', data: image.dataUrl.split(',')[1] }] };
  });
  server.registerTool('edit_chart', { description: 'Apply supported VisDelta fluent edits to the current revision. Arguments is a JSON-encoded positional array. Wait for the browser receipt and inspect the resulting chart before claiming success.', inputSchema: {
    revision: z.number().int().nonnegative(), edits: z.array(z.object({ method: z.enum(['x', 'y', 'where', 'sort', 'flip', 'color', 'focus', 'highlight']), arguments: z.string() })).min(1).max(8),
  } }, async args => text(await bridge.edit(args)));
  server.registerTool('restore_chart', { description: 'Reset to initial chart or undo/redo the last change. Revision must match the observed chart.', inputSchema: { revision: z.number().int().nonnegative(), action: z.enum(['reset', 'undo', 'redo']) } }, async args => text(await bridge.restore(args)));
  server.registerTool('ask_user', { description: 'Ask a concise clarification when the intended mark, direction, measure or operation is ambiguous. Do not edit while waiting for the answer.', inputSchema: { question: z.string().min(1).max(1200) } }, async args => text(await bridge.ask(args.question)));
  return server;
}
