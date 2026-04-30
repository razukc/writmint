import type { TraceEntry, ExecutionRecorder } from './types.js';

/**
 * In-memory execution recorder.
 * Capped at maxEntries (default 1000) to prevent unbounded growth.
 */
export class ExecutionRecorderImpl implements ExecutionRecorder {
  private entries: TraceEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  record(entry: TraceEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getEntries(): readonly TraceEntry[] {
    return [...this.entries];
  }

  getEntriesFor(actionId: string): readonly TraceEntry[] {
    return this.entries.filter((e) => e.actionId === actionId);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
