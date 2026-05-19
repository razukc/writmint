import { RuntimeError } from '../../src/errors.js';
import type { HostTransports, NetworkRequest } from '../../src/permissions.js';

export interface SyntheticCall {
  kind:
    | 'network.request'
    | 'storage.get'
    | 'storage.put'
    | 'storage.delete'
    | 'storage.list'
    | 'clock.now'
    | 'audit.emit';
  input: Record<string, unknown>;
}

export function buildSyntheticAction(
  calls: SyntheticCall[]
): (t: HostTransports) => Promise<unknown[]> {
  return async (t: HostTransports): Promise<unknown[]> => {
    const outputs: unknown[] = [];
    for (const call of calls) {
      outputs.push(await runOne(call, t));
    }
    return outputs;
  };
}

async function runOne(call: SyntheticCall, t: HostTransports): Promise<unknown> {
  const inp = call.input;
  switch (call.kind) {
    case 'network.request': {
      requireTransport(t.network, 'network');
      return t.network!.request(inp as unknown as NetworkRequest);
    }
    case 'storage.get': {
      requireTransport(t.storage, 'storage');
      return t.storage!.get(inp.scope as string, inp.key as string);
    }
    case 'storage.put': {
      requireTransport(t.storage, 'storage');
      return t.storage!.put(inp.scope as string, inp.key as string, inp.value);
    }
    case 'storage.delete': {
      requireTransport(t.storage, 'storage');
      return t.storage!.delete(inp.scope as string, inp.key as string);
    }
    case 'storage.list': {
      requireTransport(t.storage, 'storage');
      return t.storage!.list(inp.scope as string, inp.prefix as string | undefined);
    }
    case 'clock.now': {
      requireTransport(t.clock, 'clock');
      return t.clock!.now();
    }
    case 'audit.emit': {
      requireTransport(t.audit, 'audit');
      t.audit!.emit(inp as unknown as Parameters<NonNullable<HostTransports['audit']>['emit']>[0]);
      return undefined;
    }
    default:
      throw new RuntimeError({
        code: 'mcp.synthetic_action.unknown_kind',
        where: 'tools/mcp/synthetic-action.ts:runOne',
        expected: 'one of: network.request, storage.{get,put,delete,list}, clock.now, audit.emit',
        actual: String((call as { kind: unknown }).kind),
        fixHint: 'Set capability_calls[N].kind to a supported BrokerCallKind.',
      });
  }
}

function requireTransport<T>(
  value: T | undefined,
  name: string
): asserts value is T {
  if (value === undefined) {
    throw new RuntimeError({
      code: 'mcp.synthetic_action.missing_transport',
      where: `tools/mcp/synthetic-action.ts:runOne[${name}]`,
      expected: `transports.${name} provided`,
      actual: 'undefined',
      fixHint: `The manifest declares a ${name} capability but the host did not provide a ${name} transport. Wire one before recording.`,
    });
  }
}
