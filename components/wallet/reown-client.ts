"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { walletNetworks } from "@/lib/wallet/networks";

let initializedProjectId: string | null = null;
let initialization: Promise<void> | null = null;

export function initializeReown(projectId: string) {
  if (initialization && initializedProjectId === projectId) return initialization;
  if (initialization && initializedProjectId !== projectId) return Promise.reject(new Error("REOWN_PROJECT_CHANGED"));
  initializedProjectId = projectId;
  initialization = Promise.resolve().then(() => {
    const wagmiAdapter = new WagmiAdapter({ projectId, networks: walletNetworks, ssr: true });
    const solanaAdapter = new SolanaAdapter();
    createAppKit({
      adapters: [wagmiAdapter, solanaAdapter], projectId, networks: walletNetworks,
      metadata: { name: "KOL Signal Monitor", description: "四链聪明资金信号与只读钱包连接", url: window.location.origin, icons: [`${window.location.origin}/favicon.svg`] },
      themeMode: "dark",
      features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
    });
  });
  return initialization;
}
