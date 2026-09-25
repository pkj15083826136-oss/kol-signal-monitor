export const MIN_FLOW_USD = 10_000_000;
const exchangeWords = /(binance|coinbase|upbit|okx|bybit|kraken|bitget|gate(?:\.io)?|mexc|huobi|htx)/i;
const bridgeWords = /(bridge|wormhole|layerzero|stargate|portal|hop protocol|across)/i;

export type FlowClassification = "exchange_inflow" | "exchange_outflow" | "internal_transfer" | "same_entity" | "bridge" | "unclassified";
type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const asRecords = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(asRecord) : [];
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

export function normalizeWhaleAlert(input: JsonRecord, discoveredAt = new Date().toISOString()) {
  const amountUsd = Number(input.amount_usd ?? input.amountUsd ?? 0); if (!Number.isFinite(amountUsd) || amountUsd < MIN_FLOW_USD) return null;
  const from = asRecord(input.from); const to = asRecord(input.to); const txHash = String(input.hash || input.transaction_hash || input.tx_hash || "").trim(); if (!txHash) return null;
  const fromAddress = String(from.address || input.from_address || ""); const toAddress = String(to.address || input.to_address || ""); const fromOwner = String(from.owner || input.from_owner || ""); const toOwner = String(to.owner || input.to_owner || "");
  const classified = classifyFlow(fromOwner, toOwner); const knownFrom = fromOwner && !/^unknown(?: wallet)?$/i.test(fromOwner); const knownTo = toOwner && !/^unknown(?: wallet)?$/i.test(toOwner); const occurred = new Date(Number(input.timestamp || 0) * 1000); const chainOccurredAt = Number.isFinite(occurred.getTime()) && occurred.getTime() > 0 ? occurred.toISOString() : discoveredAt;
  const symbol = String(input.symbol || "").toUpperCase(); const amount = String(input.amount ?? "0"); const priceUsd = Number(input.unit_price_usd ?? (amount && Number(amount) ? amountUsd / Number(amount) : 0));
  return { eventKey: `whale_alert:${String(input.blockchain || "unknown")}:${txHash}:${String(input.index ?? input.sub_index ?? 0)}:${symbol}`, provider: "whale_alert", chain: String(input.blockchain || "unknown"), symbol, amount, amountUsd, priceUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null, priceAt: chainOccurredAt, txHash, fromAddress, toAddress, fromEntity: knownFrom ? fromOwner : null, toEntity: knownTo ? toOwner : null, fromLabelSource: knownFrom ? "Whale Alert attribution" : null, toLabelSource: knownTo ? "Whale Alert attribution" : null, labelConfidence: knownFrom || knownTo ? "provider_attributed" : "unverified", direction: classified.direction, classification: classified.classification, countsTowardNetflow: classified.countsTowardNetflow, institutionTradeSide: null, bridgeName: classified.classification === "bridge" ? (bridgeWords.exec(`${fromOwner} ${toOwner}`)?.[0] || null) : null, chainOccurredAt, discoveredAt, rawFingerprint: `${txHash}:${amountUsd}:${fromOwner}:${toOwner}` };
}

// Alerts WebSocket sends amounts[] and transaction.hash; the scalar shape above
// is retained for the original adapter contract and normalized independently.
export function normalizeWhaleAlerts(input: JsonRecord, discoveredAt = new Date().toISOString()) {
  if (!Array.isArray(input.amounts)) {
    const row = normalizeWhaleAlert(input, discoveredAt);
    return row ? [row] : [];
  }
  if (input.type !== "alert" || input.transaction_type !== undefined && input.transaction_type !== "transfer") return [];
  const transaction = asRecord(input.transaction);
  if (!transaction || typeof transaction.hash !== "string" || !transaction.hash.trim()) return [];
  const subTransactions = asRecords(transaction.sub_transactions);
  return asRecords(input.amounts).flatMap((amount, index) => {
    const symbol = String(amount.symbol || "").trim().toUpperCase();
    if (!symbol || !Number.isFinite(Number(amount.value_usd)) || Number(amount.value_usd) < MIN_FLOW_USD) return [];
    const sub = subTransactions.find((candidate) => String(candidate.symbol || "").toUpperCase() === symbol && candidate.transaction_type === "transfer");
    const inputs = asRecords(sub?.inputs); const outputs = asRecords(sub?.outputs);
    const fromAddress = inputs.length === 1 ? inputs[0] : null;
    const toAddress = outputs.length === 1 ? outputs[0] : null;
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

export type BitqueryAddressLabel = { address: string; chain?: string; type: string; value: string; recordedAt?: string | null };

export type PublicRpcTransfer = {
  chain?: string; txHash?: string; logIndex?: number | string; symbol?: string; amount?: number | string;
  fromAddress?: string; toAddress?: string; blockNumber?: number | string; blockTimestamp?: string;
  tokenContract?: string; rawAmount?: string; priceUsd?: number | string; priceAt?: string; priceSource?: string; valuationMethod?: string;
  trackedAddresses?: string[]; trackedEntities?: Array<{ address?: string; exchange?: string; source?: string }>; sourceUrl?: string; attributionUrl?: string;
};

/** Normalizes decoded ERC-20 transfers. Attribution is accepted only for addresses in the official disclosed set. */
export function normalizePublicRpcTransfer(input: PublicRpcTransfer, discoveredAt = new Date().toISOString()) {
  const chain = String(input.chain || "ethereum").toLowerCase();
  const txHash = String(input.txHash || "").trim();
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const amount = Number(input.amount);
  const fromAddress = String(input.fromAddress || "").toLowerCase();
  const toAddress = String(input.toAddress || "").toLowerCase();
  const legacy = (input.trackedAddresses || []).map((address) => ({ address, exchange: "Binance", source: "Binance 官方储备证明披露地址" }));
  const tracked = new Map([...legacy, ...(input.trackedEntities || [])].map((row) => [String(row.address || "").toLowerCase(), { exchange: String(row.exchange || ""), source: String(row.source || "交易所官方披露地址") }]));
  const stablecoin = ["USDT", "USDC"].includes(symbol);
  const priceUsd = stablecoin ? 1 : Number(input.priceUsd);
  const amountUsd = amount * priceUsd;
  if (chain !== "ethereum" || !/^0x[0-9a-f]{64}$/i.test(txHash) || !symbol || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(priceUsd) || priceUsd <= 0 || !Number.isFinite(amountUsd) || amountUsd < MIN_FLOW_USD || !/^0x[0-9a-f]{40}$/.test(fromAddress) || !/^0x[0-9a-f]{40}$/.test(toAddress)) return null;
  const fromKnown = tracked.get(fromAddress); const toKnown = tracked.get(toAddress);
  if (!fromKnown && !toKnown) return null;
  if (stablecoin && fromAddress === `0x${"0".repeat(40)}`) return null;
  const classified = classifyFlow(fromKnown?.exchange, toKnown?.exchange);
  const chainOccurredAt = Number.isFinite(new Date(String(input.blockTimestamp)).getTime()) ? new Date(String(input.blockTimestamp)).toISOString() : discoveredAt;
  const tokenContract = String(input.tokenContract || "").toLowerCase();
  const priceAt = Number.isFinite(new Date(String(input.priceAt || chainOccurredAt)).getTime()) ? new Date(String(input.priceAt || chainOccurredAt)).toISOString() : chainOccurredAt;
  return {
    eventKey: `public_rpc:${chain}:${txHash}:${String(input.logIndex ?? 0)}:${symbol}`, provider: "public_rpc", chain, symbol,
    tokenContract: /^0x[0-9a-f]{40}$/.test(tokenContract) ? tokenContract : null, rawAmount: input.rawAmount ? String(input.rawAmount) : null,
    amount: String(input.amount), amountUsd, priceUsd, priceAt, priceSource: stablecoin ? "发行方 1 美元锚定名义值" : String(input.priceSource || ""), valuationMethod: stablecoin ? "stablecoin_nominal_usd" : String(input.valuationMethod || "verified_event_time_price"), valuationStatus: "verified",
    txHash, sourceUrl: String(input.sourceUrl || `https://etherscan.io/tx/${txHash}`), attributionUrl: String(input.attributionUrl || "https://www.binance.com/en/proof-of-reserves"),
    fromAddress, toAddress, fromEntity: fromKnown?.exchange || null, toEntity: toKnown?.exchange || null,
    fromLabelSource: fromKnown?.source || null, toLabelSource: toKnown?.source || null, labelConfidence: "official_disclosure",
    direction: classified.direction, classification: classified.classification, countsTowardNetflow: classified.countsTowardNetflow,
    institutionTradeSide: null, bridgeName: null, chainOccurredAt, discoveredAt,
    rawFingerprint: `${chain}:${txHash}:${String(input.logIndex ?? 0)}:${symbol}:${amount}:${fromAddress}:${toAddress}`,
  };
}

export const MIN_STABLECOIN_MINT_USD = 100_000_000;
export type PublicStablecoinMint = { chain?: string; txHash?: string; logIndex?: number | string; symbol?: string; tokenContract?: string; rawAmount?: string; amount?: number | string; recipientAddress?: string | null; blockTimestamp?: string; evidenceType?: string; sourceUrl?: string; contractEvidenceUrl?: string };

/** Publishes only native issuer-contract mint/issue events strictly above USD 100m. */
export function normalizePublicStablecoinMint(input: PublicStablecoinMint, discoveredAt = new Date().toISOString()) {
  const chain = String(input.chain || "ethereum").toLowerCase();
  const txHash = String(input.txHash || "").trim();
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const tokenContract = String(input.tokenContract || "").toLowerCase();
  const amount = Number(input.amount);
  const evidenceType = String(input.evidenceType || "");
  if (chain !== "ethereum" || !/^0x[0-9a-f]{64}$/i.test(txHash) || !["USDT", "USDC"].includes(symbol) || !/^0x[0-9a-f]{40}$/.test(tokenContract) || !Number.isFinite(amount) || amount <= MIN_STABLECOIN_MINT_USD || !["tether_issue_event", "circle_mint_event"].includes(evidenceType)) return null;
  const chainOccurredAt = Number.isFinite(new Date(String(input.blockTimestamp)).getTime()) ? new Date(String(input.blockTimestamp)).toISOString() : discoveredAt;
  const issuer = symbol === "USDT" ? "Tether" : "Circle";
  const recipientAddress = input.recipientAddress && /^0x[0-9a-f]{40}$/i.test(input.recipientAddress) ? input.recipientAddress.toLowerCase() : null;
  return {
    eventKey: `public_rpc_mint:${chain}:${txHash}:${String(input.logIndex ?? 0)}:${symbol}`, provider: "public_rpc", chain, symbol, tokenContract,
    rawAmount: String(input.rawAmount || ""), amount: String(input.amount), amountUsd: amount, txHash, logIndex: Number(input.logIndex || 0), issuer, recipientAddress,
    evidenceType, issuanceClassification: "onchain_mint_inventory_status_unverified",
    sourceUrl: String(input.sourceUrl || `https://etherscan.io/tx/${txHash}`), contractEvidenceUrl: String(input.contractEvidenceUrl || ""), chainOccurredAt, discoveredAt,
  };
}

function addressOf(value: unknown) {
  const row = asRecord(value);
  return String(row.Address || row.address || value || "").trim();
}

function entityFromLabels(address: string, labels: BitqueryAddressLabel[]) {
  const relevant = labels.filter((label) => label.address.toLowerCase() === address.toLowerCase());
  const exchange = relevant.find((label) => /^cex-(?:hot|cold|deposit|withdrawal)-?(?:address|wallet)?$/i.test(label.type));
  const bridge = relevant.find((label) => /bridge/i.test(label.type));
  const selected = exchange || bridge || relevant[0];
  if (!selected) return { entity: null, source: null, confidence: "unverified" as const };
  return { entity: selected.value, source: `Bitquery Metadata.Labels:${selected.type}`, confidence: "provider_attributed" as const };
}

/** Accepts the documented Bitquery V2 EVM, Tron and Solana Transfers response shape. */
export function normalizeBitqueryTransfers(input: unknown, chain: string, labels: BitqueryAddressLabel[] = [], discoveredAt = new Date().toISOString()) {
  const data = asRecord(asRecord(input).data || input);
  const root = asRecord(data.EVM || data.Tron || data.Solana || data[chain]);
  const rows = asRecords(root.Transfers);
  return rows.flatMap((row, index) => {
    const transfer = asRecord(row.Transfer);
    const transaction = asRecord(row.Transaction);
    const block = asRecord(row.Block);
    const amountUsd = Number(transfer.AmountInUSD ?? transfer.amountInUsd ?? 0);
    const amount = Number(transfer.Amount ?? transfer.amount ?? 0);
    const txHash = String(transaction.Hash || transaction.Signature || transaction.hash || "").trim();
    const currency = asRecord(transfer.Currency);
    const symbol = String(currency.Symbol || currency.symbol || "").trim().toUpperCase();
    const fromAddress = addressOf(transfer.Sender);
    const toAddress = addressOf(transfer.Receiver);
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_FLOW_USD || !Number.isFinite(amount) || amount <= 0 || !txHash || !symbol || !fromAddress || !toAddress) return [];
    const from = entityFromLabels(fromAddress, labels);
    const to = entityFromLabels(toAddress, labels);
    const classified = classifyFlow(from.entity, to.entity);
    const occurred = new Date(String(block.Time || discoveredAt));
    const chainOccurredAt = Number.isFinite(occurred.getTime()) ? occurred.toISOString() : discoveredAt;
    const transferId = String(transfer.Id ?? transfer.Index ?? index);
    return [{
      eventKey: `bitquery:${chain}:${txHash}:${transferId}:${symbol}`,
      provider: "bitquery",
      chain,
      symbol,
      amount: String(transfer.Amount),
      amountUsd,
      priceUsd: amountUsd / amount,
      priceAt: chainOccurredAt,
      txHash,
      fromAddress,
      toAddress,
      fromEntity: from.entity,
      toEntity: to.entity,
      fromLabelSource: from.source,
      toLabelSource: to.source,
      labelConfidence: from.confidence === "provider_attributed" || to.confidence === "provider_attributed" ? "provider_attributed" : "unverified",
      direction: classified.direction,
      classification: classified.classification,
      countsTowardNetflow: classified.countsTowardNetflow,
      institutionTradeSide: null,
      bridgeName: classified.classification === "bridge" ? (from.entity || to.entity) : null,
      chainOccurredAt,
      discoveredAt,
      rawFingerprint: `${chain}:${txHash}:${transferId}:${symbol}:${amountUsd}:${from.entity || ""}:${to.entity || ""}`,
    }];
  });
}
