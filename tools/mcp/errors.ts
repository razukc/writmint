import { isStructuredError, getStructured, type StructuredError } from '../../src/errors.js';
import { ReplayDivergenceError } from '../../src/replay.js';

export interface CallToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

/**
 * Tagged-union envelope embedded in every handler's text response. Callers
 * branch on `ok` to reach either `data` (success-specific) or `errors`
 * (always an array of StructuredError, single-element for single-rule
 * failures). The MCP-level `isError` flag mirrors `!ok` and is the
 * protocol-correct way to signal tool-call failure to the transport;
 * callers that parse the text without inspecting the envelope can read
 * `ok` instead. The two channels never disagree.
 */
export type StructuredEnvelope =
  | { ok: true; data: unknown }
  | { ok: false; errors: StructuredError[] };

export async function wrapStructured(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    const envelope: StructuredEnvelope = { ok: true, data: result };
    return { content: [{ type: 'text', text: JSON.stringify(envelope) }] };
  } catch (err) {
    if (isStructuredError(err)) {
      // Pull every error if the thrower batched them (e.g. RuntimeError /
      // ApprovalError with allErrors); fall back to the single structured
      // entry for legacy throwers.
      const allErrors = (err as { allErrors?: readonly StructuredError[] }).allErrors;
      const structured = getStructured(err) as StructuredError;
      const errors: StructuredError[] = Array.isArray(allErrors)
        ? Array.from(allErrors)
        : [structured];
      const envelope: StructuredEnvelope = { ok: false, errors };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(envelope) }],
      };
    }
    throw err;
  }
}

export function divergenceToPayload(err: ReplayDivergenceError): StructuredError {
  return err.structured;
}
