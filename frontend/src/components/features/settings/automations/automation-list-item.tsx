import { useTranslation } from "react-i18next";
import { FaTrash } from "react-icons/fa6";
import { IoPlay } from "react-icons/io5";
import { MdHistory } from "react-icons/md";
import { Automation } from "#/api/automation-service.types";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export function AutomationListItemSkeleton() {
  return (
    <div className="border-t border-tertiary py-3 px-3 flex items-center justify-between">
      <div className="flex items-center gap-6 w-full">
        <span className="skeleton h-4 w-32" />
        <span className="skeleton h-4 w-24" />
        <span className="skeleton h-4 w-16" />
        <span className="skeleton h-4 w-24" />
      </div>
      <div className="flex items-center gap-4">
        <span className="skeleton h-4 w-4" />
        <span className="skeleton h-4 w-4" />
        <span className="skeleton h-4 w-4" />
      </div>
    </div>
  );
}

function formatCronSchedule(schedule: string, timezone: string): string {
  return `${schedule} (${timezone})`;
}

interface AutomationListItemProps {
  automation: Automation;
  onToggleEnabled: () => void;
  onDispatch: () => void;
  onViewRuns: () => void;
  onDelete: () => void;
  isDispatching?: boolean;
  isToggling?: boolean;
}

export function AutomationListItem({
  automation,
  onToggleEnabled,
  onDispatch,
  onViewRuns,
  onDelete,
  isDispatching,
  isToggling,
}: AutomationListItemProps) {
  const { t } = useTranslation();

  const schedule = formatCronSchedule(
    automation.trigger.schedule,
    automation.trigger.timezone,
  );
  const lastTriggered = automation.last_triggered_at
    ? new Date(automation.last_triggered_at).toLocaleString()
    : t(I18nKey.AUTOMATIONS$NEVER);

  return (
    <tr data-testid="automation-item" className="border-t border-tertiary">
      <td className="p-3 text-sm text-content-2" title={automation.name}>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium truncate max-w-[200px]">
            {automation.name}
          </span>
          <span className="text-xs opacity-60 truncate max-w-[200px]">
            {automation.entrypoint}
          </span>
        </div>
      </td>

      <td
        className="p-3 text-sm text-content-2 font-mono text-xs"
        title={schedule}
      >
        {schedule}
      </td>

      <td className="p-3">
        <button
          type="button"
          onClick={onToggleEnabled}
          disabled={isToggling}
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors",
            automation.enabled
              ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
              : "bg-red-900/30 text-red-400 hover:bg-red-900/50",
            isToggling && "opacity-50 cursor-not-allowed",
          )}
          title={
            automation.enabled
              ? t(I18nKey.AUTOMATIONS$CLICK_TO_DISABLE)
              : t(I18nKey.AUTOMATIONS$CLICK_TO_ENABLE)
          }
        >
          {automation.enabled
            ? t(I18nKey.AUTOMATIONS$ENABLED)
            : t(I18nKey.AUTOMATIONS$DISABLED)}
        </button>
      </td>

      <td className="p-3 text-sm text-content-2 opacity-80 text-xs">
        {lastTriggered}
      </td>

      <td className="p-3">
        <div className="flex items-center justify-end gap-3">
          <button
            data-testid="dispatch-automation-button"
            type="button"
            onClick={onDispatch}
            disabled={isDispatching}
            aria-label={t(I18nKey.AUTOMATIONS$RUN_NOW)}
            title={t(I18nKey.AUTOMATIONS$RUN_NOW)}
            className={cn(
              "cursor-pointer text-green-400 hover:text-green-300 transition-colors",
              isDispatching && "opacity-50 cursor-not-allowed animate-pulse",
            )}
          >
            <IoPlay size={16} />
          </button>
          <button
            data-testid="view-runs-button"
            type="button"
            onClick={onViewRuns}
            aria-label={t(I18nKey.AUTOMATIONS$VIEW_RUNS)}
            title={t(I18nKey.AUTOMATIONS$VIEW_RUNS)}
            className="cursor-pointer hover:text-primary transition-colors"
          >
            <MdHistory size={18} />
          </button>
          <button
            data-testid="delete-automation-button"
            type="button"
            onClick={onDelete}
            aria-label={t(I18nKey.AUTOMATIONS$DELETE)}
            title={t(I18nKey.AUTOMATIONS$DELETE)}
            className="cursor-pointer hover:text-red-400 transition-colors"
          >
            <FaTrash size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
