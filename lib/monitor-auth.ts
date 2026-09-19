export function isMonitorAuthorized(request: Request, monitorSecret: string): boolean {
  if (!monitorSecret) return false;
  return request.headers.get("authorization") === `Bearer ${monitorSecret}`;
}
