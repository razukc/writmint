/**
 * Pure metrics core for the dogfood proof corpus. No I/O, no src/ imports.
 * Operates on normalized AttemptResult sequences so the same logic serves
 * unit tests (synthetic results) and the live runner (verifyManifest output).
 */

export interface AttemptResult {
  valid: boolean;
  errors: Array<{ code: string; where: string }>;
}

export interface Convergence {
  converged: boolean;
  totalRoundTrips: number | null;
}

/**
 * Total round-trips = the 1-based position of the first accepted attempt.
 * 05b accepts on its 5th attempt → 5. Null when nothing converges.
 */
export function computeConvergence(results: AttemptResult[]): Convergence {
  const idx = results.findIndex((r) => r.valid);
  if (idx === -1) return { converged: false, totalRoundTrips: null };
  return { converged: true, totalRoundTrips: idx + 1 };
}
