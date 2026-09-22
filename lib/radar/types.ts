export const RADAR_DECISIONS = ["APPROVE", "HOLD", "REJECT", "EMERGENCY_CLOSE"] as const;
export type RadarDecision = typeof RADAR_DECISIONS[number];
export type RadarChain = "sol" | "bsc" | "base" | "robinhood";

export type RadarCandidate = {
  source: string;
  sourceEventId: string;
  chain: RadarChain;
  tokenAddress: string;
  pairAddress: string | null;
  name: string;
  symbol: string;
  firstSeenAt: string;
  poolCreatedAt: string | null;
  price: string | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  holders: number | null;
  buyers: number | null;
  sellers: number | null;
  smartMoneyCount: number;
  dataFetchedAt: string;
  identityVerified: boolean;
  sellSimulationPassed: boolean | null;
  honeypot: boolean | null;
  mintable: boolean | null;
  freezable: boolean | null;
  blacklistable: boolean | null;
  taxModifiable: boolean | null;
  buyTaxBps: number | null;
  sellTaxBps: number | null;
  lpLocked: boolean | null;
  topHolderPct: number | null;
  developerRisk: "known_bad" | "clear" | "unknown";
  priceImpactBps: number | null;
  sourceConflict: boolean;
  launchpadId?: string | null;
  launchpadProgram?: string | null;
  launchpadFactoryVerified?: boolean;
  launchpadPairVerified?: boolean;
  launchpadBuyPath?: boolean;
  launchpadSellPath?: boolean;
  rawSnapshot: Record<string, unknown>;
};

export type RadarAiReview = {
  decision: RadarDecision;
  confidence: number;
  narrative_score: number;
  risk_score: number;
  stage: string;
  positive_reasons: string[];
  negative_reasons: string[];
  invalidators: string[];
  recommended_action: string;
  model_version: string;
  evidence_refs: string[];
};

export type HardFilterResult = { passed: boolean; reasons: string[] };
export type RadarScore = {
  security: number;
  liquidity: number;
  smartMoney: number;
  growth: number;
  volumeFit: number;
  narrative: number;
  developer: number;
  total: number;
  version: string;
};

export type RadarStrategy = {
  minLiquidityUsd: number;
  maxPriceImpactBps: number;
  maxTaxBps: number;
  maxTopHolderPct: number;
  minBuyers: number;
  minTransactions: number;
  minPoolAgeMs: number;
  maxDataAgeMs: number;
  minSecurityScore: number;
  minNarrativeScore: number;
  minTotalScore: number;
  minAiConfidence: number;
};

export const DEFAULT_RADAR_STRATEGY: RadarStrategy = {
  minLiquidityUsd: 25_000,
  maxPriceImpactBps: 1_000,
  maxTaxBps: 1_500,
  maxTopHolderPct: 25,
  minBuyers: 20,
  minTransactions: 30,
  minPoolAgeMs: 5 * 60_000,
  maxDataAgeMs: 2 * 60_000,
  minSecurityScore: 70,
  minNarrativeScore: 60,
  minTotalScore: 70,
  minAiConfidence: 0.7,
};
