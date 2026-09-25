import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("public flow production semantics", () => {
  it("describes Actions as scheduled handoff with cursor recovery, not gapless realtime", () => {
    const workflow = read(".github/workflows/public-flow-continuous.yml");
    const runbook = read("docs/PUBLIC_FLOW_ALWAYS_ON.md");
    expect(workflow).toContain("Public fund-flow scheduled handoff collector");
    expect(runbook).toContain("定时接棒＋游标补采");
    expect(runbook).toContain("不承诺全天无空窗或稳定一分钟发现");
    expect(runbook).toContain("新的等待任务会取消并替换旧的等待任务");
  });

  it("keeps stale and anonymous-RPC failure semantics visible in Chinese", () => {
    const page = read("app/flows/flow-dashboard.tsx");
    expect(page).toContain("数据已陈旧");
    expect(page).toContain("公共 RPC 触发限流，正在退避并从游标补采");
    expect(page).toContain("当前记录仅代表上次成功采集前的历史数据");
    expect(page).toContain("UNI ≥1,000 万美元真实样本仍为“待验证”");
  });
});
