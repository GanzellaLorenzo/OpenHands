import { useTranslation } from "react-i18next";
import { IoArrowBack } from "react-icons/io5";
import {
  AutomationRun,
  AutomationRunStatus,
} from "#/api/automation-service.types";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

function StatusBadge({ status }: { status: AutomationRunStatus }) {
  const styles: Record<AutomationRunStatus, string> = {
    PENDING: "bg-yellow-900/30 text-yellow-400",
    RUNNING: "bg-blue-900/30 text-blue-400",
    COMPLETED: "bg-green-900/30 text-green-400",
    FAILED: "bg-red-900/30 text-red-400",
  };

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full text-xs font-medium",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

interface AutomationRunsPanelProps {
  automationName: string;
  runs: AutomationRun[];
  total: number;
  isLoading: boolean;
  onBack: () => void;
}

export function AutomationRunsPanel({
  automationName,
  runs,
  total,
  isLoading,
  onBack,
}: AutomationRunsPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer hover:text-primary transition-colors"
          aria-label={t(I18nKey.AUTOMATIONS$BACK_TO_LIST)}
        >
          <IoArrowBack size={20} />
        </button>
        <div>
          <h3 className="text-sm font-medium">
            {t(I18nKey.AUTOMATIONS$RUNS_TITLE, { name: automationName })}
          </h3>
          <span className="text-xs text-content-2 opacity-60">
            {t(I18nKey.AUTOMATIONS$TOTAL_RUNS, { count: total })}
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="border border-tertiary rounded-md p-4 text-center text-sm text-content-2 opacity-60">
          {t(I18nKey.AUTOMATIONS$LOADING_RUNS)}
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="border border-tertiary rounded-md p-4 text-center text-sm text-content-2 opacity-60">
          {t(I18nKey.AUTOMATIONS$NO_RUNS)}
        </div>
      )}

      {!isLoading && runs.length > 0 && (
        <div className="border border-tertiary rounded-md overflow-hidden">
          <table className="w-full min-w-full table-fixed">
            <thead className="bg-base-tertiary">
              <tr>
                <th className="w-[15%] text-left p-3 text-xs font-medium">
                  {t(I18nKey.AUTOMATIONS$COL_STATUS)}
                </th>
                <th className="w-[22%] text-left p-3 text-xs font-medium">
                  {t(I18nKey.AUTOMATIONS$COL_CREATED)}
                </th>
                <th className="w-[22%] text-left p-3 text-xs font-medium">
                  {t(I18nKey.AUTOMATIONS$COL_STARTED)}
                </th>
                <th className="w-[15%] text-left p-3 text-xs font-medium">
                  {t(I18nKey.AUTOMATIONS$COL_DURATION)}
                </th>
                <th className="w-[26%] text-left p-3 text-xs font-medium">
                  {t(I18nKey.AUTOMATIONS$COL_DETAILS)}
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-tertiary">
                  <td className="p-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="p-3 text-xs text-content-2">
                    {formatTimestamp(run.created_at)}
                  </td>
                  <td className="p-3 text-xs text-content-2">
                    {formatTimestamp(run.started_at)}
                  </td>
                  <td className="p-3 text-xs text-content-2">
                    {formatDuration(run.started_at, run.completed_at)}
                  </td>
                  <td className="p-3 text-xs text-content-2">
                    {run.error_detail && (
                      <span
                        className="text-red-400 truncate block max-w-[200px]"
                        title={run.error_detail}
                      >
                        {run.error_detail}
                      </span>
                    )}
                    {run.conversation_id && (
                      <a
                        href={`/conversations/${run.conversation_id}`}
                        className="text-primary hover:underline"
                      >
                        {t(I18nKey.AUTOMATIONS$VIEW_CONVERSATION)}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
