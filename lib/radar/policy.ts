import { DEFAULT_RADAR_STRATEGY, type HardFilterResult, type RadarAiReview, type RadarCandidate, type RadarDecision, type RadarScore, type RadarStrategy } from "@/lib/radar/types";
import { tokenAddressEquals } from "@/lib/token-market";
import { evaluateLaunchpadSafety, trustedLaunchpadProfile } from "@/lib/radar/launchpad";

export const RADAR_RULE_VERSION = "radar-hard-filter-v1";
export const RADAR_SCORE_VERSION = "radar-score-v1";

function finite(value: number | null): value is number { return value !== null && Number.isFinite(value); }
function cap(value: number, max: number) { return Math.max(0, Math.min(max, Math.round(value))); }

export function radarCandidateKey(chain: string, tokenAddress: string) {
  return `${chain}:${chain === "sol" ? tokenAddress : tokenAddress.toLowerCase()}`;
}

export function sourceEventKey(candidate: Pick<RadarCandidate, "source" | "sourceEventId">) {
  return `${candidate.source}:${candidate.sourceEventId}`;
}

export function hardFilter(candidate: RadarCandidate, strategy: RadarStrategy = DEFAULT_RADAR_STRATEGY, now = Date.now()): HardFilterResult {
  const reasons: string[] = [];
  if (!candidate.identityVerified || !candidate.tokenAddress || !candidate.pairAddress) reasons.push("链、Token 或 Pair 身份无法完整验证");
  if (candidate.pairAddress && tokenAddressEquals(candidate.chain, candidate.pairAddress, candidate.tokenAddress)) reasons.push("Pair 地址不得与 Token 地址相同");
  if (!finite(candidate.liquidity) || candidate.liquidity < strategy.minLiquidityUsd) reasons.push("流动性不足或未知");
  if (!finite(candidate.priceImpactBps) || candidate.priceImpactBps > strategy.maxPriceImpactBps) reasons.push("价格冲击过高或无法验证");
  const launchpadProfile = candidate.launchpadId && candidate.launchpadProgram
    ? trustedLaunchpadProfile(candidate.chain, candidate.launchpadId, candidate.launchpadProgram)
    : null;
  if (launchpadProfile) {
    const fetched = Date.parse(candidate.dataFetchedAt);
    const launchpad = evaluateLaunchpadSafety({
      profile: launchpadProfile,
      identityVerified: candidate.identityVerified,
      factoryVerified: candidate.launchpadFactoryVerified === true,
      pairVerified: candidate.launchpadPairVerified === true,
      hasLiquidity: finite(candidate.liquidity) && candidate.liquidity > 0,
      buyPath: candidate.launchpadBuyPath === true,
      sellPath: candidate.launchpadSellPath === true && candidate.sellSimulationPassed === true,
      priceImpactBps: candidate.priceImpactBps,
      fresh: Number.isFinite(fetched) && now - fetched <= strategy.maxDataAgeMs,
      maliciousEvidence: candidate.honeypot === true || candidate.sourceConflict ? ["存在貔貅或多数据源冲突证据"] : [],
      maxImpactBps: strategy.maxPriceImpactBps,
    });
    reasons.push(...launchpad.hardFailures);
  } else {
    if (candidate.sellSimulationPassed !== true || candidate.honeypot === true) reasons.push("卖出模拟未通过或疑似貔貅");
    if (candidate.mintable !== false || candidate.freezable !== false || candidate.blacklistable !== false || candidate.taxModifiable !== false) reasons.push("合约权限未安全确认");
    if (!finite(candidate.buyTaxBps) || !finite(candidate.sellTaxBps) || candidate.buyTaxBps > strategy.maxTaxBps || candidate.sellTaxBps > strategy.maxTaxBps) reasons.push("买卖税异常或未知");
    if (candidate.lpLocked !== true) reasons.push("流动性锁定状态未确认");
    if (!finite(candidate.topHolderPct) || candidate.topHolderPct > strategy.maxTopHolderPct) reasons.push("Top 持仓过度集中或未知");
    if (candidate.developerRisk !== "clear") reasons.push("开发者历史风险未排除");
  }
  if (!finite(candidate.buyers) || !finite(candidate.sellers) || candidate.buyers < strategy.minBuyers || candidate.buyers + candidate.sellers < strategy.minTransactions) reasons.push("真实交易数或买家数不足");
  const created = candidate.poolCreatedAt ? Date.parse(candidate.poolCreatedAt) : NaN;
  if (!Number.isFinite(created) || now - created < strategy.minPoolAgeMs) reasons.push("池子年龄不足或未知");
  const fetched = Date.parse(candidate.dataFetchedAt);
  if (!Number.isFinite(fetched) || now - fetched > strategy.maxDataAgeMs) reasons.push("数据过期");
  if (candidate.sourceConflict) reasons.push("多数据源严重冲突");
  const numericPrice = candidate.price === null ? null : Number(candidate.price);
  if (!finite(candidate.marketCap) || !finite(numericPrice) || !finite(candidate.volume24h) || candidate.marketCap <= 0 || numericPrice <= 0) reasons.push("关键行情字段缺失");
  return { passed: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function scoreCandidate(candidate: RadarCandidate, ai?: RadarAiReview): RadarScore {
  const security = cap(25 - (candidate.sourceConflict ? 8 : 0) - (candidate.topHolderPct && candidate.topHolderPct > 15 ? 5 : 0) - (candidate.developerRisk !== "clear" ? 7 : 0), 25);
  const liquidity = cap(finite(candidate.liquidity) ? Math.log10(Math.max(candidate.liquidity, 1)) * 3 : 0, 15);
  const smartMoney = cap(candidate.smartMoneyCount * 2.5, 15);
  const growth = cap(((candidate.buyers ?? 0) - (candidate.sellers ?? 0)) / 3 + (candidate.holders ?? 0) / 200, 10);
  const volumeFit = cap(finite(candidate.marketCap) && finite(candidate.volume24h) && candidate.marketCap > 0 ? (candidate.volume24h / candidate.marketCap) * 10 : 0, 10);
  const narrative = cap(((ai?.narrative_score ?? 0) / 100) * 20, 20);
  const developer = candidate.developerRisk === "clear" ? 5 : 0;
  return { security, liquidity, smartMoney, growth, volumeFit, narrative, developer, total: security + liquidity + smartMoney + growth + volumeFit + narrative + developer, version: RADAR_SCORE_VERSION };
}

export function decideRadar(candidate: RadarCandidate, ai: RadarAiReview, strategy: RadarStrategy = DEFAULT_RADAR_STRATEGY, now = Date.now()): { decision: RadarDecision; hard: HardFilterResult; score: RadarScore; reasons: string[] } {
  const hard = hardFilter(candidate, strategy, now);
  const score = scoreCandidate(candidate, ai);
  if (!hard.passed) return { decision: "REJECT", hard, score, reasons: hard.reasons };
  if (ai.decision === "EMERGENCY_CLOSE" || ai.decision === "REJECT") return { decision: ai.decision, hard, score, reasons: ai.negative_reasons };
  const meets = score.security >= strategy.minSecurityScore * 0.25 && ai.narrative_score >= strategy.minNarrativeScore && score.total >= strategy.minTotalScore && ai.confidence >= strategy.minAiConfidence;
  return { decision: meets && ai.decision === "APPROVE" ? "APPROVE" : "HOLD", hard, score, reasons: meets ? ai.positive_reasons : ["分数或AI置信度未达门槛"] };
}
