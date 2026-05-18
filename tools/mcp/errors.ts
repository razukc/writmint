import { isStructuredError, getStructured, type StructuredError } from '../../src/errors.js';
import { ReplayDivergenceError } from '../../src/replay.js';

export interface CallToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

export async function wrapStructured(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    if (isStructuredError(err)) {
      const structured = getStructured(err) as StructuredError;
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(structured) }],
      };
    }
    throw err;
  }
}

export function divergenceToPayload(err: ReplayDivergenceError): StructuredError {
  return err.structured;
}
