export const ALERT_THRESHOLDS = [6, 18, 38, 58] as const;

export function normalizeAddress(chain: string, address: string): string {
  const trimmed = address.trim();
  return ["sol", "solana"].includes(chain.toLowerCase()) ? trimmed : trimmed.toLowerCase();
}

export function countIndependentWallets(chain: string, rows: Array<{ wallet: string; balance: number }>): number {
  return new Set(rows.filter((row) => Number(row.balance) > 0.000001).map((row) => normalizeAddress(chain, row.wallet))).size;
}

export function dueAlertThreshold(holderCount: number, alerted: Iterable<number>): number | undefined {
  const completed = new Set(alerted);
  const due = [...ALERT_THRESHOLDS].reverse().find((threshold) => holderCount >= threshold);
  return due !== undefined && !completed.has(due) ? due : undefined;
}
