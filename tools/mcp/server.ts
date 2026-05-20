import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import {
  validateManifest,
  hashManifest,
  submitManifest,
  approveManifest,
  auditEvents,
  record,
  replay,
  formatError,
} from './handlers.js';

const server = new McpServer({ name: 'writmint', version: '0.2.0' });

// Raw zod shapes (NOT z.object wrappers) — the SDK wraps them internally.
// Validation of manifest contents is delegated to the Writmint pillars; we
// only enforce the outermost shape so handlers receive parseable input.
const ManifestShape = { manifest: z.unknown() };

const ApproveShape = {
  manifest: z.unknown(),
  approver: z.string(),
  destructiveApprovedBy: z.string().optional(),
};

const RecordShape = {
  manifest: z.unknown(),
  actionId: z.string(),
  input: z.unknown(),
  capability_calls: z.array(z.object({ kind: z.string(), input: z.record(z.string(), z.unknown()) })),
};

const ReplayShape = {
  ...RecordShape,
  recording: z.unknown(),
};

const FormatErrorShape = {
  error: z.object({
    code: z.string(),
    where: z.string(),
    expected: z.string(),
    actual: z.string(),
    fixHint: z.string(),
  }),
};

server.registerTool('validate_manifest', {
  description: 'Validate a CapabilityManifest. Returns ok/false with structured errors carrying fixHint.',
  inputSchema: ManifestShape,
}, (args) => validateManifest(args as never));

server.registerTool('hash_manifest', {
  description: 'Compute the canonical SHA-256 hash a manifest will be bound to at approval time.',
  inputSchema: ManifestShape,
}, (args) => hashManifest(args as never));

server.registerTool('submit_manifest', {
  description: 'Submit a manifest into the approval lifecycle. Returns {state:"submitted", hash, manifestId, warnings}.',
  inputSchema: ManifestShape,
}, (args) => submitManifest(args as never));

server.registerTool('approve_manifest', {
  description: 'Submit and approve a manifest. Requires destructiveApprovedBy if any action is destructive.',
  inputSchema: ApproveShape,
}, (args) => approveManifest(args as never));

server.registerTool('audit_events', {
  description: 'Inspect what an audit sink would observe for a manifest. Returns {events:[]}; first-cut placeholder, see README.',
  inputSchema: ManifestShape,
}, (args) => auditEvents(args as never));

server.registerTool('record', {
  description: 'Record a deterministic synthetic action over in-memory transports. capability_calls is a flat list; no branching.',
  inputSchema: RecordShape,
}, (args) => record(args as never));

server.registerTool('replay', {
  description: 'Replay a recording strictly. Divergence is returned as {divergence} in a non-error result.',
  inputSchema: ReplayShape,
}, (args) => replay(args as never));

server.registerTool('format_error', {
  description: 'Format a StructuredError into a single human-readable line.',
  inputSchema: FormatErrorShape,
}, (args) => formatError(args as never));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('writmint MCP server connected (stdio)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
