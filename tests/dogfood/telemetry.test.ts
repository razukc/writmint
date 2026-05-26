import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTelemetry } from '../../tools/dogfood/telemetry.js';

describe('appendTelemetry', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'writmint-telemetry-'));
    path = join(dir, 'writmint-errors.jsonl');
  });

  it('creates the file and writes one JSONL line', () => {
    appendTelemetry(path, {
      layer: 'hook',
      code: 'manifest.invalid',
      where: 'capabilities[0].id',
    });

    expect(existsSync(path)).toBe(true);
    const contents = readFileSync(path, 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      layer: 'hook',
      code: 'manifest.invalid',
      where: 'capabilities[0].id',
    });
    expect(typeof parsed.ts).toBe('string');
    expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
  });

  it('appends to an existing file without overwriting', () => {
    appendTelemetry(path, { layer: 'hook', code: 'a', where: 'x' });
    appendTelemetry(path, { layer: 'skill', code: 'b', where: 'y' });

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).code).toBe('a');
    expect(JSON.parse(lines[1]).code).toBe('b');
  });

  it('creates parent directories if missing', () => {
    const nested = join(dir, 'a', 'b', 'c', 'writmint-errors.jsonl');
    appendTelemetry(nested, { layer: 'hook', code: 'c', where: 'z' });
    expect(existsSync(nested)).toBe(true);
  });

  it('includes optional manifestId when provided', () => {
    appendTelemetry(path, {
      layer: 'hook',
      code: 'manifest.invalid',
      where: 'x',
      manifestId: 'feature.foo@0.1.0',
    });
    const parsed = JSON.parse(readFileSync(path, 'utf8').trim());
    expect(parsed.manifestId).toBe('feature.foo@0.1.0');
  });
});
