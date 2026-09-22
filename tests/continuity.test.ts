import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { classifySchedule, scheduledSlotFor } from "@/lib/continuity";

describe("production continuity", () => {
  it("derives the expected hourly :07 slot and exposes schedule delay", () => {
    expect(scheduledSlotFor("2026-09-22T04:40:41.000Z")?.toISOString()).toBe("2026-09-22T04:07:00.000Z");
    const status = classifySchedule({ run_number: 38, status: "completed", conclusion: "success", created_at: "2026-09-22T04:40:41.000Z", run_started_at: "2026-09-22T04:40:41.000Z", updated_at: "2026-09-22T05:23:08.000Z" }, new Date("2026-09-22T05:30:00.000Z"));
    expect(status.schedule).toBe("delayed");
    expect(status.delayMinutes).toBe(34);
  });

  it("marks a missing natural run as stopped instead of normal", () => {
    const status = classifySchedule({ run_number: 38, status: "completed", conclusion: "success", created_at: "2026-09-22T04:40:41.000Z", updated_at: "2026-09-22T05:23:08.000Z" }, new Date("2026-09-22T08:30:00.000Z"));
    expect(status.schedule).toBe("stopped");
  });

  it("keeps Ave credentials local and uses a dedicated collector secret", async () => {
    const [collector, launcher] = await Promise.all([
      readFile("scripts/ave-smart-collector.mjs", "utf8"),
      readFile("scripts/start-ave-smart-collector.ps1", "utf8"),
    ]);
    expect(collector).toContain("AVE_COLLECTOR_SECRET");
    expect(collector).not.toContain("MONITOR_SECRET");
    expect(collector).not.toMatch(/cookie|localStorage|sessionStorage/i);
    expect(launcher).toContain("ConvertTo-SecureString");
    expect(launcher).toContain("LOCALAPPDATA");
    expect(launcher).not.toContain("MONITOR_SECRET");
  });
});
