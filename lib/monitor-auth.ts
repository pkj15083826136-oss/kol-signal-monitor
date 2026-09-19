export function isMonitorAuthorized(request: Request, monitorSecret: string): boolean {
  if (!monitorSecret) return false;
  return request.headers.get("authorization") === `Bearer ${monitorSecret}`;
}

export function isMonitorPaused(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}
