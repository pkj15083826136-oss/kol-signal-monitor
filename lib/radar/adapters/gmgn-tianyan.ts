import type { RadarChain } from "@/lib/radar/types";

export const GMGN_TIAN_YAN_BLOCKED = "GMGN_TIAN_YAN_BLOCKED" as const;
export function isTianyanSource(source: string) { return source === "gmgn_tianyan"; }

export class GmgnTianyanAdapter {
  readonly source = "gmgn_tianyan";
  async discover(input: { chains: RadarChain[]; cursor?: string | null }) {
    return { status: GMGN_TIAN_YAN_BLOCKED, source: this.source, cursor: input.cursor ?? null, candidates: [], reason: "真实浏览器访问被 Cloudflare 403 阻断，未发现可在当前账号上下文合法稳定复用的结构化天眼请求；不使用KOL聚集冒充。", observedAt: new Date().toISOString() };
  }
}
