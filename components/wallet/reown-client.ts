"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { walletNetworks } from "@/lib/wallet/networks";

let initialized = false;

export function initializeReown(projectId: string) {
  if (initialized) return;
  const wagmiAdapter = new WagmiAdapter({ projectId, networks: walletNetworks, ssr: true });
  const solanaAdapter = new SolanaAdapter();
  createAppKit({
    adapters: [wagmiAdapter, solanaAdapter], projectId, networks: walletNetworks,
    metadata: { name: "KOL Signal Monitor", description: "四链聪明资金信号与只读钱包连接", url: window.location.origin, icons: [`${window.location.origin}/favicon.svg`] },
    themeMode: "dark",
    features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
  });
  initialized = true;
}
