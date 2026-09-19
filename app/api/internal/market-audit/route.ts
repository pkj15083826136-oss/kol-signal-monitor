import { env } from "cloudflare:workers";
import { getMarketData, getMarketSourceAudit } from "@/lib/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const HYPE = "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "hype") return Response.json(await getMarketSourceAudit("sol", HYPE), { headers: { "Cache-Control": "no-store" } });
  const db = env.DB;
  if (!db) return Response.json({ error: "DB binding unavailable" }, { status: 500 });
  if (scope === "holders12") {
    const samples: unknown[] = [];
    for (const chain of ["sol", "bsc", "base", "robinhood"]) {
      const candidates = await db.prepare("SELECT token_address, COUNT(*) wallet_count FROM token_wallets WHERE chain = ? GROUP BY token_address ORDER BY wallet_count DESC LIMIT 3").bind(chain).all<{ token_address: string; wallet_count: number }>();
      samples.push(...await Promise.all(candidates.results.map(async (row) => {
        const market = await getMarketData(chain, row.token_address).catch(() => null);
        return { chain, address: row.token_address, walletCount: row.wallet_count, symbol: market?.symbol || "", holderCount: market?.holders ?? null, holderSource: market?.holderSource ?? null, holderUpdatedAt: market?.holderUpdatedAt ?? null, identityVerified: market?.identityVerified ?? false };
      })));
    }
    return Response.json({ capturedAt: new Date().toISOString(), count: samples.length, samples }, { headers: { "Cache-Control": "no-store" } });
  }
  if (scope !== "recent50") return Response.json({ error: "Not Found" }, { status: 404 });
  const rows = await db.prepare("SELECT id, chain, token_address, symbol, market_cap FROM signals ORDER BY alerted_at DESC LIMIT 50").all<{ id: number; chain: string; token_address: string; symbol: string; market_cap: number }>();
  const output: unknown[] = [];
  for (let start = 0; start < rows.results.length; start += 6) {
    const chunk = rows.results.slice(start, start + 6);
    output.push(...await Promise.all(chunk.map(async (row) => {
      const market = await getMarketData(row.chain, row.token_address).catch(() => null);
      const live = market?.filterMarketCap ?? market?.marketCap ?? null;
      const stored = Number(row.market_cap) || null;
      return { id: row.id, chain: row.chain, address: row.token_address, symbol: row.symbol, storedMarketCap: stored, liveMarketCap: live, ratio: stored && live ? Math.max(stored, live) / Math.min(stored, live) : null, marketDataConflict: market?.marketDataConflict ?? false, sourceValues: market?.marketCapCandidates ?? {}, reason: market?.selectionReason ?? "unavailable", holderCount: market?.holders ?? null, holderSource: market?.holderSource ?? null };
    })));
  }
  return Response.json({ capturedAt: new Date().toISOString(), count: output.length, rows: output }, { headers: { "Cache-Control": "no-store" } });
}
