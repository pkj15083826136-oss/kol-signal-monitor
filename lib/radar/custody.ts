export type TradingWalletProvisionRequest = { userId: string; namespace: "eip155" | "solana" };
export type TradingWalletDescriptor = { publicAddress: string; keyReference: string; provider: string };

export interface KmsEnvelopePort {
  provision(request: TradingWalletProvisionRequest): Promise<TradingWalletDescriptor>;
  rotate(keyReference: string): Promise<{ keyReference: string }>;
  disable(keyReference: string): Promise<void>;
}

export class DisabledCustodyPort implements KmsEnvelopePort {
  async provision(): Promise<TradingWalletDescriptor> { throw new Error("CUSTODY_SECURITY_REVIEW_REQUIRED"); }
  async rotate(): Promise<{ keyReference: string }> { throw new Error("CUSTODY_SECURITY_REVIEW_REQUIRED"); }
  async disable(): Promise<void> { throw new Error("CUSTODY_SECURITY_REVIEW_REQUIRED"); }
}
