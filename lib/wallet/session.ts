export type WalletChain = "sol" | "bsc" | "base" | "robinhood";
export type WalletStatus = "idle" | "connecting" | "connected" | "switching" | "error";

export type WalletSnapshot = {
  status: WalletStatus;
  address: string | null;
  chain: WalletChain | null;
  balance: string | null;
  error: string | null;
};

export interface ReadonlyWalletProvider {
  connect(): Promise<{ address: string; chain: WalletChain }>;
  switchChain(chain: WalletChain): Promise<void>;
  balance(): Promise<string>;
  disconnect(): Promise<void>;
}

export const emptyWalletSnapshot: WalletSnapshot = { status: "idle", address: null, chain: null, balance: null, error: null };

export class ReadonlyWalletSession {
  private value: WalletSnapshot = { ...emptyWalletSnapshot };
  constructor(private readonly provider: ReadonlyWalletProvider) {}
  snapshot() { return { ...this.value }; }

  async connect() {
    this.value = { ...emptyWalletSnapshot, status: "connecting" };
    try {
      const account = await this.provider.connect();
      const balance = await this.provider.balance();
      this.value = { status: "connected", address: account.address, chain: account.chain, balance, error: null };
    } catch (error) {
      this.value = { ...emptyWalletSnapshot, status: "error", error: walletError(error, "连接已取消") };
    }
    return this.snapshot();
  }

  async switchChain(chain: WalletChain) {
    const previous = this.snapshot();
    this.value = { ...previous, status: "switching", error: null };
    try {
      await this.provider.switchChain(chain);
      this.value = { ...previous, status: "connected", chain, balance: await this.provider.balance(), error: null };
    } catch (error) {
      this.value = { ...previous, status: "error", error: walletError(error, "切换网络失败") };
    }
    return this.snapshot();
  }

  async disconnect() {
    await this.provider.disconnect();
    this.value = { ...emptyWalletSnapshot };
    return this.snapshot();
  }
}

function walletError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
