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

export interface SegmentReport {
  cluster: string;
  roundTripsSpent: number;
  resolvedAtAttempt: number | null;
}

/**
 * Cluster = first dotted token, except the two network sub-namespaces which
 * use their first two tokens so the host-policy lesson stays distinct from
 * generic permission errors.
 */
export function clusterOf(code: string): string {
  const parts = code.split('.');
  if (parts[0] === 'permission' && (parts[1] === 'network' || parts[1] === 'network-dynamic')) {
    return `${parts[0]}.${parts[1]}`;
  }
  return parts[0] ?? code;
}

export function computeSegments(results: AttemptResult[]): SegmentReport[] {
  const clustersByAttempt = results.map(
    (r) => new Set(r.errors.map((e) => clusterOf(e.code)))
  );
  const firstSeen = new Map<string, number>();
  clustersByAttempt.forEach((set, i) => {
    for (const c of set) if (!firstSeen.has(c)) firstSeen.set(c, i);
  });

  const reports: SegmentReport[] = [];
  for (const [cluster, start] of firstSeen) {
    let roundTripsSpent = 0;
    let lastPresentIndex = -1;
    for (let i = start; i < clustersByAttempt.length; i++) {
      if (clustersByAttempt[i].has(cluster)) {
        roundTripsSpent++;
        lastPresentIndex = i;
      }
    }
    // resolvedAtAttempt is set only if the cluster is absent in the final attempt
    // otherwise null (never resolved). If absent at final attempt, it's lastPresentIndex + 2
    // (converting the next absent attempt to 1-based)
    const resolvedAtAttempt = lastPresentIndex < clustersByAttempt.length - 1
      ? lastPresentIndex + 2
      : null;
    reports.push({ cluster, roundTripsSpent, resolvedAtAttempt });
  }
  // sort by first appearance for stable, readable output
  reports.sort((a, b) => (firstSeen.get(a.cluster)! - firstSeen.get(b.cluster)!));
  return reports;
}
