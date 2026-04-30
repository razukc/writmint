import type {
  HostTransports,
  NetworkRequest,
  NetworkResponse,
  NetworkTransport,
} from '../../src/capabilities.js';

export type ChaosFault =
  | { kind: 'timeout'; afterMs: number }
  | { kind: 'http_error'; status: number; bodyText?: string }
  | { kind: 'connection_drop'; message?: string }
  | { kind: 'malformed_json'; status?: number };

export interface ChaosRule {
  match: (input: NetworkRequest) => boolean;
  fault: ChaosFault;
  /** how many calls matching `match` to fault. Default Infinity. */
  times?: number;
}

export interface ChaosController {
  addRule(rule: ChaosRule): void;
  reset(): void;
  faultsApplied(): number;
}

export class ChaosTimeoutError extends Error {
  constructor(input: NetworkRequest, afterMs: number) {
    super(`network timeout after ${afterMs}ms for ${input.method} ${input.url}`);
    this.name = 'ChaosTimeoutError';
  }
}

export class ChaosConnectionDropError extends Error {
  constructor(input: NetworkRequest, msg?: string) {
    super(`connection dropped for ${input.method} ${input.url}${msg ? ': ' + msg : ''}`);
    this.name = 'ChaosConnectionDropError';
  }
}

export function withChaos(
  base: HostTransports
): { transports: HostTransports; controller: ChaosController } {
  const rules: ChaosRule[] = [];
  let faultsApplied = 0;

  const consumeRule = (input: NetworkRequest): ChaosFault | null => {
    for (const rule of rules) {
      if (!rule.match(input)) continue;
      const remaining = rule.times ?? Infinity;
      if (remaining <= 0) continue;
      if (rule.times !== undefined) rule.times = remaining - 1;
      faultsApplied++;
      return rule.fault;
    }
    return null;
  };

  const network: NetworkTransport | undefined = base.network && {
    async request(input: NetworkRequest): Promise<NetworkResponse> {
      const fault = consumeRule(input);
      if (!fault) return base.network!.request(input);

      switch (fault.kind) {
        case 'timeout':
          throw new ChaosTimeoutError(input, fault.afterMs);
        case 'connection_drop':
          throw new ChaosConnectionDropError(input, fault.message);
        case 'http_error':
          return {
            status: fault.status,
            headers: { 'content-type': 'text/plain' },
            body: fault.bodyText ?? `HTTP ${fault.status}`,
          };
        case 'malformed_json':
          return {
            status: fault.status ?? 200,
            headers: { 'content-type': 'application/json' },
            body: '{"unterminated',
          };
      }
    },
  };

  const transports: HostTransports = { ...base, network };
  const controller: ChaosController = {
    addRule(rule) {
      rules.push(rule);
    },
    reset() {
      rules.length = 0;
      faultsApplied = 0;
    },
    faultsApplied() {
      return faultsApplied;
    },
  };

  return { transports, controller };
}
