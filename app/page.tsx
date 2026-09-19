import { env } from "cloudflare:workers";
import Dashboard, { type SignalRow } from "./dashboard";
import { watchedWallets } from "@/lib/wallets";
import { verifiedTokenIdentity } from "@/lib/token-identity";
import { isMatureBaseAsset } from "@/lib/signal-policy";

export const dynamic = "force-dynamic";

const demoSignals: SignalRow[] = [
  { id: 0, chain: "sol", tokenAddress: "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk", name: "USELESS", symbol: "USELESS", logo: "", threshold: 38, holderCount: 42, marketCap: 251100000, liquidity: 4600000, holders: 68100, volume24h: 18500000, aiAnalysis: "鲸鱼资金持续流入，叙事围绕“无用即价值”的反讽文化扩散；热度较强，但需防范高位集中兑现。", gmgnTheme: "Solana 社区文化 Meme", alertedAt: new Date().toISOString(), walletNames: ["cented", "Cupsey", "Tahi", "聪明钱包"], demo: true },
  { id: -1, chain: "base", tokenAddress: "0x71f…d30c", name: "Based Signal", symbol: "SIGNAL", logo: "", threshold: 18, holderCount: 21, marketCap: 640000, liquidity: 72000, holders: 2840, volume24h: 910000, aiAnalysis: "社区正在传播AI代理与链上信号叙事，买盘扩散速度较快；有效原创内容仍偏少。", gmgnTheme: "AI Agent Meme", alertedAt: new Date(Date.now() - 18 * 60_000).toISOString(), walletNames: ["KOL-A", "KOL-B", "聪明钱包"], demo: true },
];

async function loadSignals(): Promise<{ signals: SignalRow[]; lastRun: string | null; monitorOk: boolean }> {
  try {
    const rows = await env.DB.prepare(`SELECT id, chain, token_address, name, symbol, logo, threshold, holder_count, market_cap,
      liquidity, holders, volume_24h, gmgn_theme, ai_analysis, wallet_names_json, alerted_at
      FROM signals ORDER BY alerted_at DESC LIMIT 60`).all<Record<string, unknown>>();
    const run = await env.DB.prepare("SELECT status, finished_at FROM monitor_runs ORDER BY id DESC LIMIT 1").first<{ status: string; finished_at: string }>();
    return {
      signals: rows.results.map((row) => {
        const identity = verifiedTokenIdentity(String(row.chain), String(row.token_address), String(row.name), String(row.symbol));
        return ({
        id: Number(row.id), chain: String(row.chain), tokenAddress: String(row.token_address), name: identity.name, symbol: identity.symbol, logo: String(row.logo || ""),
        threshold: Number(row.threshold), holderCount: Number(row.holder_count), marketCap: Number(row.market_cap), liquidity: Number(row.liquidity),
        holders: Number(row.holders), volume24h: Number(row.volume_24h), gmgnTheme: String(row.gmgn_theme), aiAnalysis: String(row.ai_analysis),
        walletNames: JSON.parse(String(row.wallet_names_json || "[]")), alertedAt: String(row.alerted_at),
      }); }).filter((signal) => !isMatureBaseAsset(signal.symbol)),
      lastRun: run?.finished_at ?? null,
      monitorOk: run?.status === "success",
    };
  } catch {
    return { signals: [], lastRun: null, monitorOk: false };
  }
}

export default async function Home() {
  const result = await loadSignals();
  return <Dashboard signals={result.signals.length ? result.signals : demoSignals} walletCount={watchedWallets.length} lastRun={result.lastRun} monitorOk={result.monitorOk} demo={!result.signals.length} />;
}
