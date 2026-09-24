export function publicCollectorStatus(status: string) {
  const labels: Record<string, string> = { CONNECTED: "运行正常", IDLE: "暂无新信号", STALE: "连接中断", LOGIN_REQUIRED: "需要登录", COLLECTOR_ERROR: "采集异常", NOT_STARTED: "连接中断", STOPPED: "连接中断" };
  return labels[status] || "采集异常";
}

export function publicEnrichmentStatus(status: string) {
  const labels: Record<string, string> = { RATE_LIMITED: "数据更新中", IP_TEMPORARILY_BANNED: "数据源暂时繁忙", RPC_ERROR: "链上数据暂不可用", UNAVAILABLE: "暂无数据", RETRY_SCHEDULED: "等待更新", PROVIDER_5XX: "数据源暂时异常", AUTH_ERROR: "数据源配置异常", INTERNAL_ERROR: "暂时无法更新" };
  return labels[status] || "等待更新";
}
