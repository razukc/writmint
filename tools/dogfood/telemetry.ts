import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TelemetryRecord {
  layer: 'hook' | 'skill';
  code: string;
  where: string;
  manifestId?: string;
  sessionId?: string;
}

export function appendTelemetry(path: string, record: TelemetryRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n';
  appendFileSync(path, line, 'utf8');
}
