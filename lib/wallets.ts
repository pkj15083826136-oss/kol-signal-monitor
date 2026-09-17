import walletData from "@/data/wallets.json";

export type WatchedWallet = {
  key: string;
  address: string;
  chains: string[];
  platforms: string[];
  categories: string[];
  name: string;
  aliases: string[];
  xLinks: string[];
};

export const watchedWallets = walletData as WatchedWallet[];
export const watchedByAddress = new Map(
  watchedWallets.flatMap((wallet) =>
    wallet.chains.map((chain) => [`${chain.toLowerCase()}:${wallet.address.toLowerCase()}`, wallet] as const),
  ),
);

