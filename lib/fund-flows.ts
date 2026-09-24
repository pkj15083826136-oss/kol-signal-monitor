export const MIN_FLOW_USD = 10_000_000;
const exchangeWords = /(binance|coinbase|upbit|okx|bybit|kraken|bitget|gate(?:\.io)?|mexc|huobi|htx)/i;
const bridgeWords = /(bridge|wormhole|layerzero|stargate|portal|hop protocol|across)/i;

export type FlowClassification = "exchange_inflow" | "exchange_outflow" | "internal_transfer" | "same_entity" | "bridge" | "unclassified";
export function classifyFlow(fromOwner?: string | null, toOwner?: string | null): { direction: "inflow" | "outflow" | "neutral"; classification: FlowClassification; countsTowardNetflow: boolean } {
  const from = String(fromOwner || ""); const to = String(toOwner || "");
  if (bridgeWords.test(from) || bridgeWords.test(to)) return { direction: "neutral", classification: "bridge", countsTowardNetflow: false };
  const fromExchange = exchangeWords.test(from); const toExchange = exchangeWords.test(to);
  if (from && to && from.toLowerCase() === to.toLowerCase()) return { direction: "neutral", classification: "same_entity", countsTowardNetflow: false };
  if (fromExchange && toExchange) return { direction: "neutral", classification: "internal_transfer", countsTowardNetflow: false };
  if (toExchange && !fromExchange) return { direction: "inflow", classification: "exchange_inflow", countsTowardNetflow: true };
  if (fromExchange && !toExchange) return { direction: "outflow", classification: "exchange_outflow", countsTowardNetflow: true };
  return { direction: "neutral", classification: "unclassified", countsTowardNetflow: false };
}

export function normalizeWhaleAlert(input: Record<string, any>, discoveredAt = new Date().toISOString()) {
  const amountUsd = Number(input.amount_usd ?? input.amountUsd ?? 0); if (!Number.isFinite(amountUsd) || amountUsd < MIN_FLOW_USD) return null;
  const from = input.from || {}; const to = input.to || {}; const txHash = String(input.hash || input.transaction_hash || input.tx_hash || "").trim(); if (!txHash) return null;
  const fromAddress = String(from.address || input.from_address || ""); const toAddress = String(to.address || input.to_address || ""); const fromOwner = String(from.owner || input.from_owner || ""); const toOwner = String(to.owner || input.to_owner || "");
  const classified = classifyFlow(fromOwner, toOwner); const knownFrom = fromOwner && !/^unknown(?: wallet)?$/i.test(fromOwner); const knownTo = toOwner && !/^unknown(?: wallet)?$/i.test(toOwner); const occurred = new Date(Number(input.timestamp || 0) * 1000); const chainOccurredAt = Number.isFinite(occurred.getTime()) && occurred.getTime() > 0 ? occurred.toISOString() : discoveredAt;
  const symbol = String(input.symbol || "").toUpperCase(); const amount = String(input.amount ?? "0"); const priceUsd = Number(input.unit_price_usd ?? (amount && Number(amount) ? amountUsd / Number(amount) : 0));
  return { eventKey: `whale_alert:${String(input.blockchain || "unknown")}:${txHash}:${String(input.index ?? input.sub_index ?? 0)}:${symbol}`, provider: "whale_alert", chain: String(input.blockchain || "unknown"), symbol, amount, amountUsd, priceUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null, priceAt: chainOccurredAt, txHash, fromAddress, toAddress, fromEntity: knownFrom ? fromOwner : null, toEntity: knownTo ? toOwner : null, fromLabelSource: knownFrom ? "Whale Alert attribution" : null, toLabelSource: knownTo ? "Whale Alert attribution" : null, labelConfidence: knownFrom || knownTo ? "provider_attributed" : "unverified", direction: classified.direction, classification: classified.classification, countsTowardNetflow: classified.countsTowardNetflow, institutionTradeSide: null, bridgeName: classified.classification === "bridge" ? (bridgeWords.exec(`${fromOwner} ${toOwner}`)?.[0] || null) : null, chainOccurredAt, discoveredAt, rawFingerprint: `${txHash}:${amountUsd}:${fromOwner}:${toOwner}` };
}

// Alerts WebSocket sends amounts[] and transaction.hash; the scalar shape above
// is retained for the original adapter contract and normalized independently.
export function normalizeWhaleAlerts(input: Record<string, any>, discoveredAt = new Date().toISOString()) {
  if (!Array.isArray(input.amounts)) {
    const row = normalizeWhaleAlert(input, discoveredAt);
    return row ? [row] : [];
  }
  if (input.type !== "alert" || input.transaction_type !== undefined && input.transaction_type !== "transfer") return [];
  const transaction = input.transaction;
  if (!transaction || typeof transaction.hash !== "string" || !transaction.hash.trim()) return [];
  const subTransactions = Array.isArray(transaction.sub_transactions) ? transaction.sub_transactions : [];
  return input.amounts.flatMap((amount: Record<string, any>, index: number) => {
    const symbol = String(amount.symbol || "").trim().toUpperCase();
    if (!symbol || !Number.isFinite(Number(amount.value_usd)) || Number(amount.value_usd) < MIN_FLOW_USD) return [];
    const sub = subTransactions.find((candidate: Record<string, any>) => String(candidate.symbol || "").toUpperCase() === symbol && candidate.transaction_type === "transfer");
    const fromAddress = Array.isArray(sub?.inputs) && sub.inputs.length === 1 ? sub.inputs[0] : null;
    const toAddress = Array.isArray(sub?.outputs) && sub.outputs.length === 1 ? sub.outputs[0] : null;
    const fromOwner = fromAddress?.owner || (typeof input.from === "string" ? input.from : "");
    const toOwner = toAddress?.owner || (typeof input.to === "string" ? input.to : "");
    const row = normalizeWhaleAlert({
      hash: transaction.hash, blockchain: input.blockchain, timestamp: input.timestamp,
      index, symbol, amount: amount.amount, amount_usd: amount.value_usd,
      unit_price_usd: sub?.unit_price_usd,
      from: { address: fromAddress?.address || "", owner: fromOwner },
      to: { address: toAddress?.address || "", owner: toOwner },
    }, discoveredAt);
    return row ? [row] : [];
  });
}
