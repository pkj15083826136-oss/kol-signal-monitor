export type PaperPositionState = {
  id: string;
  entryQuantity: bigint;
  remainingQuantity: bigint;
  netCostUsdMicros: bigint;
  realizedUsdMicros: bigint;
  peakExecutableValueUsdMicros: bigint;
  currentExecutableValueUsdMicros: bigint;
  nextTakeProfitMultiple: bigint;
  takeProfitCount: number;
  status: "open" | "closed";
};

export type PaperExitReason = "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_DRAWDOWN" | "EMERGENCY_CLOSE";
export type PaperExitAction = { type: "NONE" } | { type: "SELL"; quantity: bigint; reason: PaperExitReason; eventKey: string; ladderMultiple?: bigint };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
function half(value: bigint) { return value <= ONE ? value : (value + ONE) / TWO; }

export function evaluatePaperExit(position: PaperPositionState, executableValueUsdMicros: bigint, emergency = false): PaperExitAction {
  if (position.status !== "open" || position.remainingQuantity <= ZERO) return { type: "NONE" };
  if (emergency) return { type: "SELL", quantity: position.remainingQuantity, reason: "EMERGENCY_CLOSE", eventKey: `${position.id}:EMERGENCY_CLOSE` };
  if (executableValueUsdMicros * TWO <= position.netCostUsdMicros) return { type: "SELL", quantity: position.remainingQuantity, reason: "STOP_LOSS", eventKey: `${position.id}:STOP_LOSS` };
  const peak = position.peakExecutableValueUsdMicros > executableValueUsdMicros ? position.peakExecutableValueUsdMicros : executableValueUsdMicros;
  if (peak > ZERO && executableValueUsdMicros * TWO <= peak) return { type: "SELL", quantity: position.remainingQuantity, reason: "TRAILING_DRAWDOWN", eventKey: `${position.id}:TRAILING_DRAWDOWN:${peak}` };
  if (executableValueUsdMicros >= position.netCostUsdMicros * position.nextTakeProfitMultiple) return { type: "SELL", quantity: half(position.remainingQuantity), reason: "TAKE_PROFIT", ladderMultiple: position.nextTakeProfitMultiple, eventKey: `${position.id}:TAKE_PROFIT:${position.nextTakeProfitMultiple}` };
  return { type: "NONE" };
}

export function applyPaperFill(position: PaperPositionState, action: Exclude<PaperExitAction, { type: "NONE" }>, filledQuantity: bigint, netProceedsUsdMicros: bigint, executableValueUsdMicros: bigint): PaperPositionState {
  if (filledQuantity <= ZERO || filledQuantity > action.quantity || filledQuantity > position.remainingQuantity) throw new Error("INVALID_PAPER_FILL");
  const remaining = position.remainingQuantity - filledQuantity;
  const completedLadder = action.reason === "TAKE_PROFIT" && filledQuantity === action.quantity;
  return { ...position, remainingQuantity: remaining, realizedUsdMicros: position.realizedUsdMicros + netProceedsUsdMicros, currentExecutableValueUsdMicros: executableValueUsdMicros, peakExecutableValueUsdMicros: position.peakExecutableValueUsdMicros > executableValueUsdMicros ? position.peakExecutableValueUsdMicros : executableValueUsdMicros, nextTakeProfitMultiple: completedLadder ? position.nextTakeProfitMultiple * TWO : position.nextTakeProfitMultiple, takeProfitCount: completedLadder ? position.takeProfitCount + 1 : position.takeProfitCount, status: remaining === ZERO ? "closed" : "open" };
}

export function paperOrderIdempotencyKey(positionId: string, reason: PaperExitReason, discriminator: string) { return `paper:${positionId}:${reason}:${discriminator}`; }
