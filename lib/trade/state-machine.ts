export type TradeState =
  | "idle" | "quoted" | "blocked" | "expired" | "awaiting_approval" | "approving"
  | "awaiting_signature" | "broadcasting" | "confirming" | "confirmed" | "rejected" | "failed";

export type TradeEvent =
  | "QUOTE_READY" | "QUOTE_BLOCKED" | "QUOTE_EXPIRED" | "APPROVAL_REQUIRED" | "APPROVAL_SENT"
  | "APPROVAL_CONFIRMED" | "SIGN_REQUESTED" | "TX_SENT" | "TX_CONFIRMED" | "USER_REJECTED" | "FAILED" | "RESET";

const transitions: Record<TradeState, Partial<Record<TradeEvent, TradeState>>> = {
  idle: { QUOTE_READY: "quoted", QUOTE_BLOCKED: "blocked", FAILED: "failed" },
  quoted: { QUOTE_EXPIRED: "expired", APPROVAL_REQUIRED: "awaiting_approval", SIGN_REQUESTED: "awaiting_signature", QUOTE_BLOCKED: "blocked", FAILED: "failed" },
  blocked: { RESET: "idle" }, expired: { RESET: "idle" },
  awaiting_approval: { APPROVAL_SENT: "approving", USER_REJECTED: "rejected", FAILED: "failed" },
  approving: { APPROVAL_CONFIRMED: "awaiting_signature", FAILED: "failed" },
  awaiting_signature: { TX_SENT: "broadcasting", USER_REJECTED: "rejected", FAILED: "failed" },
  broadcasting: { TX_SENT: "confirming", TX_CONFIRMED: "confirmed", FAILED: "failed" },
  confirming: { TX_CONFIRMED: "confirmed", FAILED: "failed" },
  confirmed: { RESET: "idle" }, rejected: { RESET: "idle" }, failed: { RESET: "idle" },
};

export function transitionTrade(state: TradeState, event: TradeEvent): TradeState {
  const next = transitions[state][event];
  if (!next) throw new Error(`INVALID_TRADE_TRANSITION:${state}:${event}`);
  return next;
}
