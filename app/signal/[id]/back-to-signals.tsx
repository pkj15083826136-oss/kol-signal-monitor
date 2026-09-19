import { ArrowLeft } from "lucide-react";

export function hasValidListHistory(referrer: string, origin: string, hasSavedContext: boolean, historyLength: number) {
  if (hasSavedContext && historyLength > 1) return true;
  if (!referrer || historyLength <= 1) return false;
  try { const url = new URL(referrer); return url.origin === origin && url.pathname === "/"; }
  catch { return false; }
}

export default function BackToSignals() {
  return <form action="/" method="get"><button type="submit" className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"><ArrowLeft className="shrink-0" size={16}/>返回预警列表</button></form>;
}
