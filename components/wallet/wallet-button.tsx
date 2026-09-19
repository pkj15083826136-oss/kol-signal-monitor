"use client";

import { WalletCards } from "lucide-react";

export default function WalletButton() {
  return <div className="wallet-entry">
    <button type="button" className="wallet-disabled" title="只读钱包连接尚未配置" aria-label="连接钱包（只读，尚未配置）">
      <WalletCards size={15}/><span className="hidden sm:inline">连接钱包</span><span className="sm:hidden">钱包</span>
    </button>
    <div className="wallet-live"><appkit-button size="sm" label="连接钱包" balance="show"/></div>
  </div>;
}
