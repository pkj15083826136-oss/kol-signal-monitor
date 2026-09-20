"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BatchMarketItem } from "@/lib/batch-market";
import { marketKey, mergeMarket, pollingDelay, retainLastAvailable, type LiveMarketItem } from "@/lib/market-live";

export function useLiveMarket(tokens: Array<{ chain: string; address: string }>, enabled = true, initial: BatchMarketItem[] = []) {
  const stableKey = useMemo(() => tokens.slice(0, 30).map((token) => marketKey(token.chain, token.address)).join("|"), [tokens]);
  const previous = useRef(new Map(initial.map((item) => [marketKey(item.chain, item.address), item])));
  const requestSequence = useRef(0);
  const [items, setItems] = useState<Record<string, LiveMarketItem>>(() => Object.fromEntries(initial.map((item) => [marketKey(item.chain, item.address), mergeMarket(undefined, item)])));
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    const normalized = stableKey.split("|").filter(Boolean).map((key) => { const split = key.indexOf(":"); return { chain: key.slice(0, split), address: key.slice(split + 1) }; });
    if (!enabled || !normalized.length) return;
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const schedule = () => { timer = window.setTimeout(refresh, pollingDelay(document.hidden)); };
    const refresh = async () => {
      const sequence = ++requestSequence.current;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/market/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokens: normalized }), cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("行情服务暂不可用");
        const payload = await response.json() as { items: BatchMarketItem[] };
        if (!active || sequence !== requestSequence.current) return;
        const next: Record<string, LiveMarketItem> = {};
        for (const item of payload.items) { const key = marketKey(item.chain, item.address); const prior = previous.current.get(key); const retained = retainLastAvailable(prior, item); next[key] = mergeMarket(prior, retained); previous.current.set(key, retained); }
        setItems(next); setDegraded(payload.items.some((item) => item.source === "unavailable"));
      } catch (error) { if (active && !(error instanceof DOMException && error.name === "AbortError")) setDegraded(true); }
      if (active) schedule();
    };
    const visibility = () => { window.clearTimeout(timer); if (!document.hidden) void refresh(); else schedule(); };
    void refresh(); document.addEventListener("visibilitychange", visibility);
    return () => { active = false; controller?.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled, stableKey]);
  return { items, degraded };
}
