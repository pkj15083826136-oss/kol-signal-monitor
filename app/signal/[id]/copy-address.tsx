"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export default function CopyAddress({ address, compact = false }: { address: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <button type="button" onClick={copy} aria-label={copied ? "已复制" : "复制合约地址"} title={copied ? "已复制" : "复制合约地址"} className={`grid shrink-0 place-items-center border border-white/[0.08] bg-white/[0.03] text-slate-500 transition hover:border-cyan-300/20 hover:text-cyan-300 ${compact ? "h-7 w-7 rounded-md" : "h-8 w-8 rounded-lg"}`}>
    {copied ? <Check size={compact ? 12 : 14}/> : <Copy size={compact ? 12 : 14}/>}
  </button>;
}
