export interface StructuredError {
  code: string;
  where: string;
  expected: string;
  actual: string;
  fixHint: string;
}

export class RuntimeError extends Error {
  readonly structured: StructuredError;
  /**
   * The full set of structured errors that caused this failure. For most
   * throw sites this is a single entry matching `structured`. For batch
   * gates (e.g. an MCP handler that runs `verifyManifest()` and rejects),
   * this carries every violation so the caller can recover off all of them
   * in one round-trip. Mirrors `ApprovalError.allErrors`.
   */
  readonly allErrors: readonly StructuredError[];
  constructor(
    structured: StructuredError,
    allErrorsOrOptions?: readonly StructuredError[] | { cause?: unknown },
    optionsArg?: { cause?: unknown }
  ) {
    // Two call shapes for backward compatibility:
    //   new RuntimeError(s)
    //   new RuntimeError(s, { cause })            ← original 2-arg form
    //   new RuntimeError(s, allErrors)
    //   new RuntimeError(s, allErrors, { cause }) ← new 3-arg form
    let allErrors: readonly StructuredError[] | undefined;
    let options: { cause?: unknown } | undefined;
    if (Array.isArray(allErrorsOrOptions)) {
      allErrors = allErrorsOrOptions as readonly StructuredError[];
      options = optionsArg;
    } else {
      options = allErrorsOrOptions as { cause?: unknown } | undefined;
    }
    super(formatStructuredError(structured), options as ErrorOptions | undefined);
    this.name = 'RuntimeError';
    this.structured = structured;
    this.allErrors = allErrors ?? [structured];
  }
}

export function isStructuredError(value: unknown): value is { structured: StructuredError } {
  if (typeof value !== 'object' || value === null) return false;
  const s = (value as { structured?: unknown }).structured;
  if (typeof s !== 'object' || s === null) return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.code === 'string' &&
    typeof r.where === 'string' &&
    typeof r.expected === 'string' &&
    typeof r.actual === 'string' &&
    typeof r.fixHint === 'string'
  );
}

export function getStructured(value: unknown): StructuredError | null {
  return isStructuredError(value) ? value.structured : null;
}

export function formatStructuredError(s: StructuredError): string {
  return `[${s.code}] ${s.where}: expected ${s.expected}, got ${s.actual} — ${s.fixHint}`;
}

export const ErrorCodes = {
  validation: {
    missingField: 'validation.missing_field',
    invalidField: 'validation.invalid_field',
    duplicateId: 'validation.duplicate_id',
  },
  action: {
    timeout: 'action.timeout',
    memoryExceeded: 'action.memory_exceeded',
    handlerThrew: 'action.handler_threw',
  },
  plugin: {
    swapRejected: 'plugin.swap_rejected',
  },
} as const;

export type ErrorCode =
  | (typeof ErrorCodes.validation)[keyof typeof ErrorCodes.validation]
  | (typeof ErrorCodes.action)[keyof typeof ErrorCodes.action]
  | (typeof ErrorCodes.plugin)[keyof typeof ErrorCodes.plugin];
