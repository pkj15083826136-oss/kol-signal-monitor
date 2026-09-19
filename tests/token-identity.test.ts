import { expect, it } from "vitest";
import { isRejectedTokenIdentity, verifiedTokenIdentity } from "@/lib/token-identity";

it("corrects only the real case-sensitive BONK mint", () => {
  const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  expect(verifiedTokenIdentity("sol", mint, "wrong", "WRONG")).toEqual({ name: "Bonk", symbol: "BONK" });
  expect(verifiedTokenIdentity("sol", mint.toLowerCase(), "other", "OTHER")).toEqual({ name: "other", symbol: "OTHER" });
  expect(isRejectedTokenIdentity("sol", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6hBA2iKeiYCp")).toBe(true);
  expect(isRejectedTokenIdentity("sol", mint)).toBe(false);
});
