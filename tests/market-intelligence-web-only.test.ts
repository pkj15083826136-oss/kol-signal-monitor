import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("market-intelligence web-only isolation", () => {
  it("does not enqueue or consume WeCom deliveries for either new category", async () => {
    const [exchangeRoute, flowRoute] = await Promise.all([
      readFile("app/api/exchange-events/collect/route.ts", "utf8"),
      readFile("app/api/fund-flows/collect/route.ts", "utf8"),
    ]);
    for (const source of [exchangeRoute, flowRoute]) {
      expect(source).not.toContain("sendWeCom");
      expect(source).not.toContain("alert_deliveries");
      expect(source).toMatch(/mode:\s*"web_only"/);
    }
  });

  it("preserves the original KOL WeCom path", async () => {
    const monitorRoute = await readFile("app/api/monitor/run/route.ts", "utf8");
    expect(monitorRoute).toContain('import { sendWeComAlert } from "@/lib/wecom"');
    expect(monitorRoute).toContain("await sendWeComAlert(payload)");
  });

  it("keeps every fund-flow production collector fail-closed", async () => {
    const [workflow, flowRoute, publicCollector] = await Promise.all([
      readFile(".github/workflows/market-intelligence.yml", "utf8"),
      readFile("app/api/fund-flows/collect/route.ts", "utf8"),
      readFile("scripts/collect-public-stablecoin-flows.mjs", "utf8"),
    ]);
    expect(workflow).toContain("vars.PUBLIC_FLOW_ENABLED == 'true'");
    expect(workflow).toContain("vars.WHALE_ALERT_ENABLED == 'true'");
    expect(workflow).toContain("vars.WHALE_ALERT_PUBLIC_DISTRIBUTION_APPROVED == 'true'");
    expect(workflow).toContain("vars.BITQUERY_ENABLED == 'true'");
    expect(flowRoute).toContain("whale_alert_public_distribution_not_approved");
    expect(flowRoute).toContain("bitquery_public_distribution_not_approved");
    expect(publicCollector).toContain("public flow collector already running");
    expect(publicCollector).toContain("PUBLIC_FLOW_CONTINUOUS");
  });
});
