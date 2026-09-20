export type WalletChain = "sol" | "bsc" | "base" | "robinhood";
export type WalletNamespace = "solana" | "eip155";
export type WalletPhase = "idle" | "connecting" | "restoring" | "connected" | "switching" | "error";

export const WALLET_OPERATION_TIMEOUT_MS = 15_000;

export const WALLET_CHAIN_META: Record<WalletChain, { name: string; namespace: WalletNamespace; chainId: string; nativeSymbol: string }> = {
  sol: { name: "Solana", namespace: "solana", chainId: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", nativeSymbol: "SOL" },
  bsc: { name: "BSC", namespace: "eip155", chainId: "56", nativeSymbol: "BNB" },
  base: { name: "Base", namespace: "eip155", chainId: "8453", nativeSymbol: "ETH" },
  robinhood: { name: "Robinhood", namespace: "eip155", chainId: "4663", nativeSymbol: "ETH" },
};

export function validWalletAddress(namespace: WalletNamespace, value?: string | null) {
  if (!value) return false;
  return namespace === "eip155" ? /^0x[a-fA-F0-9]{40}$/.test(value) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export function chainFromNetwork(chainId?: string | number | null, caipNetworkId?: string | null): WalletChain | null {
  const raw = String(caipNetworkId || chainId || "");
  const id = raw.includes(":") ? raw.split(":").at(-1) || "" : raw;
  return (Object.entries(WALLET_CHAIN_META).find(([, value]) => value.chainId === id)?.[0] as WalletChain | undefined) || null;
}

export function walletConnectionPhase(input: { address?: string | null; namespace: WalletNamespace; accountStatus?: string | null; operation?: "connect" | "switch" | null; restoreTimedOut?: boolean }): WalletPhase {
  if (validWalletAddress(input.namespace, input.address)) return input.operation === "switch" ? "switching" : "connected";
  if (input.restoreTimedOut) return "error";
  if (input.operation === "switch") return "switching";
  if (input.operation === "connect") return "connecting";
  if (input.accountStatus === "reconnecting") return "restoring";
  if (input.accountStatus === "connecting") return "connecting";
  return "idle";
}

export function walletErrorMessage(error: unknown, fallback = "钱包操作失败") {
  const code = typeof error === "object" && error ? Number((error as { code?: unknown }).code) : NaN;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (code === 4001 || /reject|denied|declined/i.test(message)) return "钱包已拒绝请求";
  if (/locked/i.test(message)) return "钱包已锁定，请解锁后重试";
  if (/expired|expiry/i.test(message)) return "连接二维码已过期，请重新生成";
  if (/timeout|timed out|超时/i.test(message)) return "钱包响应超时，请重新连接";
  if (/network|fetch|offline|relay/i.test(message)) return "钱包网络连接中断，请检查网络后重试";
  return message.trim() || fallback;
}

export function walletMatchesTokenChain(walletChain: WalletChain | null, tokenChain: string) { return walletChain === tokenChain; }

export class WalletOperationGate {
  private generation = 0;
  begin() { this.generation += 1; return this.generation; }
  cancel() { this.generation += 1; }
  isCurrent(generation: number) { return generation === this.generation; }
}

export async function withWalletTimeout<T>(promise: Promise<T>, timeoutMs = WALLET_OPERATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("WALLET_TIMEOUT")), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}
