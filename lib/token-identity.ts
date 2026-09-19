const overrides: Record<string, { name: string; symbol: string }> = {
  "sol:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { name: "Bonk", symbol: "BONK" },
};
const rejected = new Set(["sol:DezXAZ8z7PnrnRJjz3wXBoRgixCa6hBA2iKeiYCp"]);

export function isRejectedTokenIdentity(chain: string, address: string) {
  return rejected.has(`${chain.toLowerCase()}:${address.trim()}`);
}

export function verifiedTokenIdentity(chain: string, address: string, name: string, symbol: string) {
  const normalizedChain = chain.toLowerCase();
  const normalizedAddress = normalizedChain === "sol" ? address.trim() : address.trim().toLowerCase();
  return overrides[`${normalizedChain}:${normalizedAddress}`] || { name, symbol };
}
