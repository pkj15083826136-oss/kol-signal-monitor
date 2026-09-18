"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export default function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <button type="button" onClick={copy} aria-label="复制合约地址" title="复制合约地址" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-500 transition hover:border-cyan-300/20 hover:text-cyan-300">
    {copied ? <Check size={14}/> : <Copy size={14}/>}
  </button>;
}
