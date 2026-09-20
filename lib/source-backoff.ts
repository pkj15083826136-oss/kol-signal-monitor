export type BackoffState = { failures: number; nextRetryAt: number };

export function nextBackoff(previous: BackoffState | undefined, now: number, rateLimited: boolean, jitter = 0) {
  const failures = (previous?.failures || 0) + 1;
  const base = rateLimited ? 60_000 : 5_000;
  const cap = rateLimited ? 15 * 60_000 : 60_000;
  const delay = Math.min(cap, base * (2 ** Math.min(failures - 1, 6))) + Math.max(0, Math.min(jitter, 5_000));
  return { failures, nextRetryAt: now + delay };
}

export function canRequest(state: BackoffState | undefined, now: number) { return !state || now >= state.nextRetryAt; }
