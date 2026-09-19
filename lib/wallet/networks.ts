import { base, bsc, solana, type AppKitNetwork } from "@reown/appkit/networks";
import { defineChain } from "viem";

export const robinhood = {
  ...defineChain({
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
    blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  }),
  chainNamespace: "eip155" as const,
  caipNetworkId: "eip155:4663" as const,
};

export const walletNetworks = [solana, bsc, base, robinhood] as [AppKitNetwork, ...AppKitNetwork[]];

export const supportedWalletChains = [
  { key: "sol", name: "Solana", chainId: solana.id },
  { key: "bsc", name: "BSC", chainId: bsc.id },
  { key: "base", name: "Base", chainId: base.id },
  { key: "robinhood", name: "Robinhood", chainId: robinhood.id },
] as const;
