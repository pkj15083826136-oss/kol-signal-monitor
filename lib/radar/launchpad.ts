export type LaunchpadProfile = { id: string; chain: string; program: string; traditionalTaxApplicable: boolean; traditionalLpLockApplicable: boolean; evmOwnerApplicable: boolean; standardRoute: string; migration: string };
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const profiles: LaunchpadProfile[] = [{ id: "pump_fun", chain: "sol", program: PUMP_PROGRAM, traditionalTaxApplicable: false, traditionalLpLockApplicable: false, evmOwnerApplicable: false, standardRoute: "Pump bonding curve / PumpSwap", migration: "PumpSwap AMM" }];
export function trustedLaunchpadProfile(chain: string, platform: string, program: string) { return profiles.find((profile) => profile.chain === chain && profile.id === platform && profile.program === program) ?? null; }
export function evaluateLaunchpadSafety(input: { profile: LaunchpadProfile | null; identityVerified: boolean; factoryVerified: boolean; pairVerified: boolean; hasLiquidity: boolean; buyPath: boolean; sellPath: boolean; priceImpactBps: number | null; fresh: boolean; maliciousEvidence: string[]; maxImpactBps?: number }) {
  const hardFailures: string[] = [];
  if (!input.identityVerified) hardFailures.push("Token身份未验证"); if (!input.factoryVerified || !input.profile) hardFailures.push("发射器身份未验证"); if (!input.pairVerified) hardFailures.push("Token与曲线/池关系未验证");
  if (!input.hasLiquidity) hardFailures.push("没有可用流动性或曲线"); if (!input.buyPath) hardFailures.push("买入路径不可执行"); if (!input.sellPath) hardFailures.push("卖出路径不可执行");
  if (input.priceImpactBps === null) hardFailures.push("价格冲击缺失"); else if (input.priceImpactBps > (input.maxImpactBps ?? 1_000)) hardFailures.push("价格冲击过高"); if (!input.fresh) hardFailures.push("数据过期"); hardFailures.push(...input.maliciousEvidence);
  const notApplicable = input.profile ? [!input.profile.traditionalTaxApplicable && "传统买卖税", !input.profile.traditionalLpLockApplicable && "传统LP锁定", !input.profile.evmOwnerApplicable && "普通合约Owner/黑名单权限"].filter(Boolean) as string[] : [];
  return { hardFailures: [...new Set(hardFailures)], missingRequired: hardFailures.filter((x) => /未验证|缺失|没有/.test(x)), notApplicable, commentaryRisks: [] as string[] };
}
