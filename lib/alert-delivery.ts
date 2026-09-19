export type AlertStatus = "pending" | "retry" | "sending" | "sent" | "manual_review";

export type PendingAlert = { id: number; payload: Record<string, unknown>; attempts: number };

export interface AlertStore {
  listReady(now: string): Promise<PendingAlert[]>;
  claim(id: number, now: string): Promise<boolean>;
  markSent(id: number, now: string): Promise<void>;
  markFailed(id: number, error: string, status: "retry" | "manual_review", nextAttemptAt: string | null): Promise<void>;
}

export class AlertDeliveryError extends Error {
  constructor(message: string, public readonly retryable: boolean) { super(message); }
}

function retryAt(now: string, attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts));
  return new Date(Date.parse(now) + delayMinutes * 60_000).toISOString();
}

export async function deliverReadyAlerts(
  store: AlertStore,
  send: (payload: Record<string, unknown>) => Promise<void>,
  now = new Date().toISOString(),
) {
  const result = { sent: 0, retried: 0, manualReview: 0 };
  for (const alert of await store.listReady(now)) {
    if (!await store.claim(alert.id, now)) continue;
    try {
      await send(alert.payload);
      await store.markSent(alert.id, now);
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof AlertDeliveryError && error.retryable;
      await store.markFailed(alert.id, message.slice(0, 1000), retryable ? "retry" : "manual_review", retryable ? retryAt(now, alert.attempts + 1) : null);
      if (retryable) result.retried += 1;
      else result.manualReview += 1;
    }
  }
  return result;
}
