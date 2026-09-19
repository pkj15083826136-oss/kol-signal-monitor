export function decimalToBaseUnits(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error("INVALID_DECIMALS");
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error("INVALID_DECIMAL_AMOUNT");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("TOO_MANY_DECIMAL_PLACES");
  const normalized = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

export function percentageOfBalance(balance: string, percent: 25 | 50 | 75 | 100, feeReserve = "0"): string {
  if (!/^\d+$/.test(balance) || !/^\d+$/.test(feeReserve)) throw new Error("INVALID_BALANCE");
  const spendable = BigInt(balance) > BigInt(feeReserve) ? BigInt(balance) - BigInt(feeReserve) : BigInt(0);
  return ((spendable * BigInt(percent)) / BigInt(100)).toString();
}
