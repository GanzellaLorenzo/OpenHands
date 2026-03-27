export interface CronTrigger {
  type: "cron";
  schedule: string;
  timezone: string;
}

export type AutomationTrigger = CronTrigger;

export interface Automation {
  id: string;
  user_id: string;
  org_id: string;
  name: string;
  trigger: AutomationTrigger;
  tarball_path: string;
  setup_script_path: string | null;
  entrypoint: string;
  timeout: number | null;
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationListResponse {
  automations: Automation[];
  total: number;
}

export type AutomationRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export interface AutomationRun {
  id: string;
  automation_id: string;
  status: AutomationRunStatus;
  error_detail: string | null;
  conversation_id: string | null;
  timeout_at: string | null;
  keep_alive: boolean;
  sandbox_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AutomationRunListResponse {
  runs: AutomationRun[];
  total: number;
}

export interface CreateAutomationRequest {
  name: string;
  trigger: CronTrigger;
  tarball_path: string;
  setup_script_path?: string;
  entrypoint: string;
  timeout?: number;
}

export interface UpdateAutomationRequest {
  name?: string;
  trigger?: CronTrigger;
  tarball_path?: string;
  setup_script_path?: string;
  entrypoint?: string;
  timeout?: number;
  enabled?: boolean;
}
