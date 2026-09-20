import { describe, expect, it } from "vitest";
import { canRequest, nextBackoff } from "@/lib/source-backoff";

describe("source rate-limit backoff", () => {
  it("backs off exponentially after GMGN rate limiting", () => {
    const first = nextBackoff(undefined, 1000, true, 0);
    const second = nextBackoff(first, 1000, true, 0);
    expect(first.nextRetryAt).toBe(61_000); expect(second.nextRetryAt).toBe(121_000);
    expect(canRequest(second, 120_999)).toBe(false); expect(canRequest(second, 121_000)).toBe(true);
  });
});
