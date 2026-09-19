"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function hasValidListHistory(referrer: string, origin: string, hasSavedContext: boolean, historyLength: number) {
  if (hasSavedContext && historyLength > 1) return true;
  if (!referrer || historyLength <= 1) return false;
  try { const url = new URL(referrer); return url.origin === origin && url.pathname === "/"; }
  catch { return false; }
}

export default function BackToSignals() {
  const router = useRouter();
  const goBack = () => {
    const hasContext = Boolean(window.sessionStorage.getItem("kol-signal-list-state"));
    if (hasValidListHistory(document.referrer, window.location.origin, hasContext, window.history.length)) {
      const currentPath = window.location.pathname;
      router.back();
      window.setTimeout(() => { if (window.location.pathname === currentPath) router.push("/"); }, 600);
      return;
    }
    router.push("/");
  };
  return <button type="button" onClick={goBack} className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"><ArrowLeft className="shrink-0" size={16}/>返回预警列表</button>;
}
