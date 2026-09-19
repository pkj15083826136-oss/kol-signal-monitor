"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BatchMarketItem } from "@/lib/batch-market";
import { marketKey, mergeMarket, pollingDelay, type LiveMarketItem } from "@/lib/market-live";

export function useLiveMarket(tokens: Array<{ chain: string; address: string }>, enabled = true) {
  const stableKey = useMemo(() => tokens.slice(0, 30).map((token) => marketKey(token.chain, token.address)).join("|"), [tokens]);
  const previous = useRef(new Map<string, BatchMarketItem>());
  const [items, setItems] = useState<Record<string, LiveMarketItem>>({});
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    const normalized = stableKey.split("|").filter(Boolean).map((key) => { const split = key.indexOf(":"); return { chain: key.slice(0, split), address: key.slice(split + 1) }; });
    if (!enabled || !normalized.length) return;
    let active = true;
    let timer = 0;
    const schedule = () => { timer = window.setTimeout(refresh, pollingDelay(document.hidden)); };
    const refresh = async () => {
      try {
        const response = await fetch("/api/market/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokens: normalized }), cache: "no-store" });
        if (!response.ok) throw new Error("行情服务暂不可用");
        const payload = await response.json() as { items: BatchMarketItem[] };
        if (!active) return;
        const next: Record<string, LiveMarketItem> = {};
        for (const item of payload.items) { const key = marketKey(item.chain, item.address); next[key] = mergeMarket(previous.current.get(key), item); previous.current.set(key, item); }
        setItems(next); setDegraded(payload.items.some((item) => item.source === "unavailable"));
      } catch { if (active) setDegraded(true); }
      if (active) schedule();
    };
    const visibility = () => { window.clearTimeout(timer); if (!document.hidden) void refresh(); else schedule(); };
    void refresh(); document.addEventListener("visibilitychange", visibility);
    return () => { active = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled, stableKey]);
  return { items, degraded };
}
