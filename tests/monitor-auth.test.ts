import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { isMonitorAuthorized, isMonitorPaused } from "@/lib/monitor-auth";

it("accepts only MONITOR_SECRET for the scheduler write endpoint", () => {
  const request = (token: string) => new Request("https://example.test/api/monitor/run", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  expect(isMonitorAuthorized(request("monitor-only"), "monitor-only")).toBe(true);
  expect(isMonitorAuthorized(request("gmgn-key"), "monitor-only")).toBe(false);
  expect(isMonitorAuthorized(request(""), "")).toBe(false);
});

it("pauses only on an explicit true flag", () => {
  expect(isMonitorPaused("true")).toBe(true);
  expect(isMonitorPaused(" TRUE ")).toBe(true);
  expect(isMonitorPaused(undefined)).toBe(false);
  expect(isMonitorPaused("false")).toBe(false);
});

it("uses MONITOR_SECRET rather than GMGN_API_KEY in the scheduler Authorization header", async () => {
  const source = await readFile(new URL("../scripts/collect-gmgn.mjs", import.meta.url), "utf8");
  expect(source).toContain("Authorization: `Bearer ${process.env.MONITOR_SECRET}`");
  expect(source).not.toContain("Authorization: `Bearer ${process.env.GMGN_API_KEY}`");
});
