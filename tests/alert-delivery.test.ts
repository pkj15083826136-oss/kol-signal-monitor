import { expect, it } from "vitest";
import { AlertDeliveryError, deliverReadyAlerts, type AlertStore, type PendingAlert } from "@/lib/alert-delivery";

it("persists failure, retries, confirms success, and never resends sent alerts", async () => {
  const row: PendingAlert & { status: string; error: string | null; next: string | null } = { id: 1, payload: { symbol: "TEST" }, attempts: 0, status: "pending", error: null, next: null };
  const store: AlertStore = {
    async listReady() { return ["pending", "retry"].includes(row.status) ? [row] : []; },
    async claim() { if (!["pending", "retry"].includes(row.status)) return false; row.status = "sending"; row.attempts++; return true; },
    async markSent() { row.status = "sent"; row.error = null; },
    async markFailed(_id, error, status, next) { row.status = status; row.error = error; row.next = next; },
  };
  let calls = 0;
  await deliverReadyAlerts(store, async () => { calls++; throw new AlertDeliveryError("rejected", true); }, "2026-09-19T00:00:00.000Z");
  expect(row).toMatchObject({ status: "retry", error: "rejected", attempts: 1 });
  await deliverReadyAlerts(store, async () => { calls++; }, "2026-09-19T01:00:00.000Z");
  expect(row).toMatchObject({ status: "sent", attempts: 2 });
  await deliverReadyAlerts(store, async () => { calls++; }, "2026-09-19T02:00:00.000Z");
  expect(calls).toBe(2);
});

it("quarantines ambiguous delivery instead of risking a duplicate", async () => {
  let status = "pending";
  const store: AlertStore = {
    async listReady() { return status === "pending" ? [{ id: 2, payload: {}, attempts: 0 }] : []; },
    async claim() { status = "sending"; return true; }, async markSent() { status = "sent"; },
    async markFailed(_id, _error, nextStatus) { status = nextStatus; },
  };
  await deliverReadyAlerts(store, async () => { throw new AlertDeliveryError("timeout", false); });
  expect(status).toBe("manual_review");
});

it("quarantines a stale sending claim without attempting a duplicate delivery", async () => {
  let status = "sending";
  let sendCalls = 0;
  const store: AlertStore = {
    async quarantineStale(cutoff) {
      expect(cutoff).toBe("2026-09-19T00:50:00.000Z");
      status = "manual_review";
      return 1;
    },
    async listReady() { return []; },
    async claim() { return false; },
    async markSent() {},
    async markFailed() {},
  };
  const result = await deliverReadyAlerts(store, async () => { sendCalls += 1; }, "2026-09-19T01:00:00.000Z");
  expect(status).toBe("manual_review");
  expect(sendCalls).toBe(0);
  expect(result.manualReview).toBe(1);
});
