export type ScheduleState = "healthy" | "delayed" | "stopped" | "unknown";
export type SourceSyncState = "aligned" | "diverged" | "unknown";

export type ContinuityStatus = {
  checkedAt: string;
  github: {
    mainSha: string | null;
    sitesSha: string | null;
    sync: SourceSyncState;
    workflowState: string;
    schedule: ScheduleState;
    lastRunNumber: number | null;
    lastRunStatus: string | null;
    lastScheduledAt: string | null;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    delayMinutes: number | null;
  };
  ave: {
    state: "not_started" | "waiting_login" | "connected" | "disconnected" | "blocked";
    instanceId: string | null;
    loginStatus: string | null;
    websocketStatus: string | null;
    lastHeartbeatAt: string | null;
    lastEventAt: string | null;
    lastUploadAt: string | null;
    capturedCount: number;
    uploadedCount: number;
    dedupCount: number;
    error: string | null;
  };
  grok: { configured: boolean; lastSuccessAt: string | null };
  d1LastWriteAt: string | null;
  gmgnTianyan: "blocked_cloudflare_403";
};

type WorkflowRun = {
  run_number?: number;
  event?: string;
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  run_started_at?: string;
  updated_at?: string;
  head_sha?: string;
};

export function scheduledSlotFor(createdAt: string): Date | null {
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) return null;
  const slot = new Date(created);
  slot.setUTCMinutes(7, 0, 0);
  if (slot.getTime() > created.getTime()) slot.setUTCHours(slot.getUTCHours() - 1);
  return slot;
}

export function classifySchedule(run: WorkflowRun | null, now = new Date()): Pick<ContinuityStatus["github"], "schedule" | "lastRunNumber" | "lastRunStatus" | "lastScheduledAt" | "lastStartedAt" | "lastFinishedAt" | "delayMinutes"> {
  if (!run?.created_at) return { schedule: "unknown", lastRunNumber: null, lastRunStatus: null, lastScheduledAt: null, lastStartedAt: null, lastFinishedAt: null, delayMinutes: null };
  const created = new Date(run.created_at);
  const scheduled = scheduledSlotFor(run.created_at);
  const delayMinutes = scheduled ? Math.max(0, Math.round((created.getTime() - scheduled.getTime()) / 60_000)) : null;
  const ageMinutes = Math.max(0, (now.getTime() - created.getTime()) / 60_000);
  const succeeded = run.status === "completed" && run.conclusion === "success";
  const schedule: ScheduleState = !succeeded || ageMinutes > 150 ? "stopped" : delayMinutes !== null && delayMinutes > 15 ? "delayed" : "healthy";
  return {
    schedule,
    lastRunNumber: run.run_number ?? null,
    lastRunStatus: run.status === "completed" ? run.conclusion ?? "completed" : run.status ?? null,
    lastScheduledAt: scheduled?.toISOString() ?? null,
    lastStartedAt: run.run_started_at ?? run.created_at,
    lastFinishedAt: run.status === "completed" ? run.updated_at ?? null : null,
    delayMinutes,
  };
}

export function fallbackScheduleFromHeartbeat(lastWriteAt: string | null, now = new Date()): ReturnType<typeof classifySchedule> {
  const parsed = lastWriteAt ? new Date(lastWriteAt) : null;
  const valid = parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  const stopped = valid ? now.getTime() - valid.getTime() > 150 * 60_000 : false;
  return { schedule: stopped ? "stopped" : "unknown", lastRunNumber: null, lastRunStatus: null, lastScheduledAt: null, lastStartedAt: null, lastFinishedAt: valid?.toISOString() ?? null, delayMinutes: null };
}

function aveState(row: Record<string, unknown> | null): ContinuityStatus["ave"]["state"] {
  if (!row) return "not_started";
  if (row.login_status === "required") return "waiting_login";
  if (row.connection_status === "connected") return "connected";
  if (row.connection_status === "blocked") return "blocked";
  return "disconnected";
}

export async function loadContinuityStatus(db: D1Database, source: Record<string, unknown>, now = new Date()): Promise<ContinuityStatus> {
  const [branchResult, workflowDefinition, workflowResult, ave, d1, grok] = await Promise.all([
    fetch("https://api.github.com/repos/pkj15083826136-oss/kol-signal-monitor/branches/main", { headers: { Accept: "application/vnd.github+json", "User-Agent": "kol-signal-monitor" } }).then((response) => response.ok ? response.json() as Promise<{ commit?: { sha?: string } }> : null).catch(() => null),
    fetch("https://api.github.com/repos/pkj15083826136-oss/kol-signal-monitor/actions/workflows/monitor.yml", { headers: { Accept: "application/vnd.github+json", "User-Agent": "kol-signal-monitor" } }).then((response) => response.ok ? response.json() as Promise<{ state?: string }> : null).catch(() => null),
    fetch("https://api.github.com/repos/pkj15083826136-oss/kol-signal-monitor/actions/workflows/monitor.yml/runs?event=schedule&per_page=1", { headers: { Accept: "application/vnd.github+json", "User-Agent": "kol-signal-monitor" } }).then((response) => response.ok ? response.json() as Promise<{ workflow_runs?: WorkflowRun[] }> : null).catch(() => null),
    db.prepare("SELECT * FROM collector_status WHERE source='ave_smart_browser'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT finished_at FROM monitor_runs ORDER BY id DESC LIMIT 1").first<{ finished_at?: string }>().catch(() => null),
    db.prepare("SELECT created_at FROM radar_analysis ORDER BY id DESC LIMIT 1").first<{ created_at?: string }>().catch(() => null),
  ]);
  const mainSha = branchResult?.commit?.sha ?? (typeof source.GITHUB_MAIN_SHA === "string" ? source.GITHUB_MAIN_SHA : null);
  const sitesSha = typeof source.SITE_SOURCE_COMMIT_SHA === "string" ? source.SITE_SOURCE_COMMIT_SHA : null;
  const sync: SourceSyncState = !mainSha || !sitesSha ? "unknown" : mainSha === sitesSha ? "aligned" : "diverged";
  const workflowState = workflowDefinition?.state ?? "unknown";
  const schedule = workflowResult?.workflow_runs?.[0] ? classifySchedule(workflowResult.workflow_runs[0], now) : fallbackScheduleFromHeartbeat(d1?.finished_at ?? null, now);
  return {
    checkedAt: now.toISOString(),
    github: { mainSha, sitesSha, sync, workflowState, ...schedule },
    ave: {
      state: aveState(ave),
      instanceId: ave?.instance_id ? String(ave.instance_id) : null,
      loginStatus: ave?.login_status ? String(ave.login_status) : null,
      websocketStatus: ave?.websocket_status ? String(ave.websocket_status) : null,
      lastHeartbeatAt: ave?.last_heartbeat_at ? String(ave.last_heartbeat_at) : null,
      lastEventAt: ave?.last_event_at ? String(ave.last_event_at) : null,
      lastUploadAt: ave?.last_upload_at ? String(ave.last_upload_at) : null,
      capturedCount: Number(ave?.captured_count || 0),
      uploadedCount: Number(ave?.uploaded_count || 0),
      dedupCount: Number(ave?.dedup_count || 0),
      error: ave?.last_error ? String(ave.last_error) : null,
    },
    grok: { configured: typeof source.XAI_API_KEY === "string" && source.XAI_API_KEY.length > 0, lastSuccessAt: grok?.created_at ?? null },
    d1LastWriteAt: d1?.finished_at ?? null,
    gmgnTianyan: "blocked_cloudflare_403",
  };
}

export function emptyContinuityStatus(now = new Date()): ContinuityStatus {
  return {
    checkedAt: now.toISOString(),
    github: { mainSha: null, sitesSha: null, sync: "unknown", workflowState: "unknown", ...classifySchedule(null, now) },
    ave: { state: "not_started", instanceId: null, loginStatus: null, websocketStatus: null, lastHeartbeatAt: null, lastEventAt: null, lastUploadAt: null, capturedCount: 0, uploadedCount: 0, dedupCount: 0, error: null },
    grok: { configured: false, lastSuccessAt: null },
    d1LastWriteAt: null,
    gmgnTianyan: "blocked_cloudflare_403",
  };
}
