const overrides: Record<string, { name: string; symbol: string }> = {
  "sol:DezXAZ8z7PnrnRJjz3wXBoRgixCa6hBA2iKeiYCp": { name: "Bonk", symbol: "BONK" },
};

export function verifiedTokenIdentity(chain: string, address: string, name: string, symbol: string) {
  const normalizedChain = chain.toLowerCase();
  const normalizedAddress = normalizedChain === "sol" ? address.trim() : address.trim().toLowerCase();
  return overrides[`${normalizedChain}:${normalizedAddress}`] || { name, symbol };
}
