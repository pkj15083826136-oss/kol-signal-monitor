import type { RadarCandidate, RadarChain } from "@/lib/radar/types";

export type RadarAdapterStatus = "READY" | "BLOCKED_EXTERNAL_ENDPOINT" | "RATE_LIMITED" | "UNAVAILABLE";
export type RadarDiscoveryResult = { status: RadarAdapterStatus; source: string; cursor: string | null; candidates: RadarCandidate[]; reason: string; observedAt: string };
export interface RadarSignalAdapter { readonly source: string; discover(input: { chains: RadarChain[]; cursor?: string | null }): Promise<RadarDiscoveryResult>; }

export class AveSmartSignalAdapter implements RadarSignalAdapter {
  readonly source = "ave_smart";
  async discover(input: { chains: RadarChain[]; cursor?: string | null }): Promise<RadarDiscoveryResult> {
    return { status: "BLOCKED_EXTERNAL_ENDPOINT", source: this.source, cursor: input.cursor ?? null, candidates: [], reason: "Ave 官方公开文档未提供 Smart 信号API，/ smart 公开页面当前返回404；未使用私有或逆向接口。", observedAt: new Date().toISOString() };
  }
}
