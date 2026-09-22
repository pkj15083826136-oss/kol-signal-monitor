import { DEFAULT_RADAR_STRATEGY, type CheckState, type HardFilterResult, type RadarAiReview, type RadarCandidate, type RadarDecision, type RadarScore, type RadarStrategy, type TradeCheck } from "@/lib/radar/types";
import { isValidRadarAddress } from "@/lib/radar/identity";
import { tokenAddressEquals } from "@/lib/token-market";
import { trustedLaunchpadProfile } from "@/lib/radar/launchpad";

export const RADAR_RULE_VERSION = "radar-trade-eligibility-v2";
export const RADAR_SCORE_VERSION = "radar-score-v2";

function finite(value: number | null): value is number { return value !== null && Number.isFinite(value); }
function cap(value: number, max: number) { return Math.max(0, Math.min(max, Math.round(value))); }
function check(key: string, label: string, state: CheckState, reason: string): TradeCheck { return { key, label, state, reason }; }
function launchpadProfileFor(candidate: RadarCandidate) {
  return candidate.launchpadId && candidate.launchpadProgram ? trustedLaunchpadProfile(candidate.chain, candidate.launchpadId, candidate.launchpadProgram) : null;
}

export function radarCandidateKey(chain: string, tokenAddress: string) {
  return `${chain}:${chain === "sol" ? tokenAddress : tokenAddress.toLowerCase()}`;
}
export function sourceEventKey(candidate: Pick<RadarCandidate, "source" | "sourceEventId">) { return `${candidate.source}:${candidate.sourceEventId}`; }

export function hardFilter(candidate: RadarCandidate, strategy: RadarStrategy = DEFAULT_RADAR_STRATEGY, now = Date.now()): HardFilterResult {
  const checks: TradeCheck[] = [];
  const tokenValid = isValidRadarAddress(candidate.chain, candidate.tokenAddress);
  checks.push(check("token_address", "Token地址", tokenValid ? "PASS" : "FAIL", tokenValid ? "Token地址格式有效" : "Token地址与链格式不匹配"));
  const pairValid = candidate.pairAddress ? isValidRadarAddress(candidate.chain, candidate.pairAddress) : false;
  const sameAddress = Boolean(candidate.pairAddress && tokenAddressEquals(candidate.chain, candidate.pairAddress, candidate.tokenAddress));
  checks.push(check("pair_address", "Pair地址解析", sameAddress ? "FAIL" : pairValid ? "PASS" : "UNKNOWN", sameAddress ? "Pair地址与Token地址相同" : pairValid ? "Pair地址格式有效" : "尚未解析真实Pair地址"));
  const relationState: CheckState = sameAddress ? "FAIL" : candidate.identityVerified && pairValid ? "PASS" : "UNKNOWN";
  checks.push(check("token_pair_relation", "Token/Pair关系", relationState, relationState === "PASS" ? "Token/Pair关系已验证" : relationState === "FAIL" ? "确认Pair关系错误" : "Token/Pair关系待验证"));
  checks.push(check("liquidity", "流动性", !finite(candidate.liquidity) ? "UNKNOWN" : candidate.liquidity < strategy.minLiquidityUsd ? "FAIL" : "PASS", !finite(candidate.liquidity) ? "尚未取得流动性数据" : candidate.liquidity < strategy.minLiquidityUsd ? `确认流动性低于$${strategy.minLiquidityUsd.toLocaleString()}门槛` : "流动性达到门槛"));
  checks.push(check("sell_path", "可卖性", candidate.sellSimulationPassed === null ? "UNKNOWN" : candidate.sellSimulationPassed ? "PASS" : "FAIL", candidate.sellSimulationPassed === null ? "尚未取得可卖性模拟" : candidate.sellSimulationPassed ? "卖出路径验证通过" : "确认没有卖出路径"));
  checks.push(check("price_impact", "价格冲击", !finite(candidate.priceImpactBps) ? "UNKNOWN" : candidate.priceImpactBps > strategy.maxPriceImpactBps ? "FAIL" : "PASS", !finite(candidate.priceImpactBps) ? "尚未取得价格冲击模拟" : candidate.priceImpactBps > strategy.maxPriceImpactBps ? "确认价格冲击超过上限" : "价格冲击在上限内"));
  checks.push(check("honeypot", "恶意/黑名单", candidate.honeypot === null ? "UNKNOWN" : candidate.honeypot ? "FAIL" : "PASS", candidate.honeypot === null ? "尚未取得恶意程序检查" : candidate.honeypot ? "确认命中恶意程序或黑名单" : "未命中恶意程序或黑名单"));
  const fetched = Date.parse(candidate.dataFetchedAt);
  const freshness: CheckState = !Number.isFinite(fetched) || now - fetched > strategy.maxDataAgeMs ? "UNKNOWN" : "PASS";
  checks.push(check("freshness", "数据时效", freshness, freshness === "PASS" ? "数据在有效期内" : Number.isFinite(fetched) ? "行情数据已过期，等待刷新" : "数据时间待确认"));

  const profile = launchpadProfileFor(candidate);
  if (profile) {
    checks.push(check("tax", "传统买卖税", "NOT_APPLICABLE", "传统买卖税：不适用"));
    checks.push(check("lp_lock", "传统LP锁定", "NOT_APPLICABLE", "传统LP锁定：不适用"));
    checks.push(check("owner_permissions", "普通Owner权限", "NOT_APPLICABLE", "普通Owner权限：不适用"));
  } else {
    const permissionValues = [candidate.mintable, candidate.freezable, candidate.blacklistable, candidate.taxModifiable];
    const permissions: CheckState = permissionValues.some((value) => value === true) ? "FAIL" : permissionValues.every((value) => value === false) ? "PASS" : "UNKNOWN";
    checks.push(check("owner_permissions", "合约权限", permissions, permissions === "FAIL" ? "确认存在可增发、冻结、黑名单或改税权限" : permissions === "PASS" ? "合约权限检查通过" : "合约权限数据待补全"));
    const tax: CheckState = !finite(candidate.buyTaxBps) || !finite(candidate.sellTaxBps) ? "UNKNOWN" : candidate.buyTaxBps > strategy.maxTaxBps || candidate.sellTaxBps > strategy.maxTaxBps ? "FAIL" : "PASS";
    checks.push(check("tax", "买卖税", tax, tax === "FAIL" ? "确认买卖税超过上限" : tax === "PASS" ? "买卖税在上限内" : "买卖税数据待补全"));
    checks.push(check("lp_lock", "LP锁定", candidate.lpLocked === null ? "UNKNOWN" : candidate.lpLocked ? "PASS" : "UNKNOWN", candidate.lpLocked === true ? "LP锁定已确认" : "LP锁定信息待补全"));
  }

  const numericPrice = candidate.price === null ? null : Number(candidate.price);
  checks.push(check("market_data", "关键行情", !finite(numericPrice) || numericPrice <= 0 ? "UNKNOWN" : "PASS", !finite(numericPrice) || numericPrice <= 0 ? "价格数据待补全" : "价格数据有效"));

  const riskComments = [
    finite(candidate.topHolderPct) ? `Top持仓 ${candidate.topHolderPct.toFixed(2)}%` : "Top持仓待补全",
    candidate.developerRisk === "known_bad" ? "开发者历史存在已确认风险" : candidate.developerRisk === "clear" ? "开发者历史未见明确风险" : "开发者历史待补全",
    finite(candidate.holders) ? `持有人 ${Math.round(candidate.holders).toLocaleString()}` : "持有人数待补全",
    finite(candidate.buyers) ? `买家 ${Math.round(candidate.buyers).toLocaleString()}` : "买家数量待补全",
    candidate.poolCreatedAt ? `池创建时间 ${candidate.poolCreatedAt}` : "池龄待补全",
    candidate.sourceConflict ? "多数据源口径存在冲突，等待复核" : "多数据源未标记冲突",
  ];
  const fail = checks.filter((item) => item.state === "FAIL");
  const unknown = checks.filter((item) => item.state === "UNKNOWN");
  const status = fail.length ? "FAIL" : unknown.length ? "UNKNOWN" : "PASS";
  const reasons = (status === "FAIL" ? fail : unknown).map((item) => item.reason);
  const identityStatus = !tokenValid || sameAddress ? "FAILED" : candidate.identityVerified && pairValid ? "VERIFIED" : tokenValid && !pairValid ? "PARTIAL_VERIFIED" : "UNVERIFIED";
  return { passed: status === "PASS", status, reasons: [...new Set(reasons)], checks, riskComments, identityStatus };
}

export function scoreCandidate(candidate: RadarCandidate, ai?: RadarAiReview): RadarScore {
  const launchpadProfile = launchpadProfileFor(candidate);
  const security = launchpadProfile ? cap(25 - (candidate.sourceConflict || candidate.honeypot === true ? 10 : 0) - (candidate.sellSimulationPassed === false ? 10 : 0), 25) : cap(25 - (candidate.sourceConflict ? 8 : 0) - (candidate.topHolderPct && candidate.topHolderPct > 15 ? 5 : 0) - (candidate.developerRisk === "known_bad" ? 7 : 0), 25);
  const liquidity = cap(finite(candidate.liquidity) ? Math.log10(Math.max(candidate.liquidity, 1)) * 3 : 0, 15);
  const smartMoney = cap(candidate.smartMoneyCount * 2.5, 15);
  const growth = cap(((candidate.buyers ?? 0) - (candidate.sellers ?? 0)) / 3 + (candidate.holders ?? 0) / 200, 10);
  const volumeFit = cap(finite(candidate.marketCap) && finite(candidate.volume24h) && candidate.marketCap > 0 ? (candidate.volume24h / candidate.marketCap) * 10 : 0, 10);
  const narrative = cap((((ai?.status === "COMPLETED" ? ai.narrative_score : null) ?? 0) / 100) * 20, 20);
  const developer = launchpadProfile || candidate.developerRisk === "clear" ? 5 : 0;
  return { security, liquidity, smartMoney, growth, volumeFit, narrative, developer, total: security + liquidity + smartMoney + growth + volumeFit + narrative + developer, version: RADAR_SCORE_VERSION };
}

export function decideRadar(candidate: RadarCandidate, ai: RadarAiReview, strategy: RadarStrategy = DEFAULT_RADAR_STRATEGY, now = Date.now()): { decision: RadarDecision; hard: HardFilterResult; score: RadarScore; reasons: string[] } {
  const hard = hardFilter(candidate, strategy, now);
  const score = scoreCandidate(candidate, ai);
  if (hard.status === "FAIL") return { decision: "REJECT", hard, score, reasons: hard.reasons };
  if (hard.status === "UNKNOWN") return { decision: "HOLD", hard, score, reasons: hard.reasons };
  if (ai.status !== "COMPLETED" || ai.narrative_score === null) return { decision: "HOLD", hard, score, reasons: [ai.summary] };
  const meets = score.security >= strategy.minSecurityScore * 0.25 && ai.narrative_score >= strategy.minNarrativeScore && score.total >= strategy.minTotalScore && ai.confidence >= strategy.minAiConfidence;
  return { decision: meets && ai.decision === "APPROVE" ? "APPROVE" : "HOLD", hard, score, reasons: meets ? ai.positive_reasons : ["叙事或置信度未达Paper观察门槛"] };
}
