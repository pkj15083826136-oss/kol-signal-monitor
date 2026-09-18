const overrides: Record<string, { name: string; symbol: string }> = {
  "sol:dezxaz8z7pnrnrjjz3wxborgixca6xjnb7yab1ppb263": { name: "Bonk", symbol: "BONK" },
};

export function verifiedTokenIdentity(chain: string, address: string, name: string, symbol: string) {
  return overrides[`${chain.toLowerCase()}:${address.toLowerCase()}`] || { name, symbol };
}
