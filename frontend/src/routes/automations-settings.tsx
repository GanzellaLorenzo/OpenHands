import React from "react";
import { useTranslation } from "react-i18next";
import { useListAutomations } from "#/hooks/query/use-list-automations";
import { useListAutomationRuns } from "#/hooks/query/use-list-automation-runs";
import { useUpdateAutomation } from "#/hooks/mutation/use-update-automation";
import { useDeleteAutomation } from "#/hooks/mutation/use-delete-automation";
import { useDispatchAutomation } from "#/hooks/mutation/use-dispatch-automation";
import {
  AutomationListItem,
  AutomationListItemSkeleton,
} from "#/components/features/settings/automations/automation-list-item";
import { AutomationRunsPanel } from "#/components/features/settings/automations/automation-runs-panel";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { Automation } from "#/api/automation-service.types";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

function AutomationsSettingsScreen() {
  const { t } = useTranslation();
  const { data, isLoading } = useListAutomations();

  const { mutate: updateAutomation } = useUpdateAutomation();
  const { mutate: deleteAutomation } = useDeleteAutomation();
  const { mutate: dispatchAutomation } = useDispatchAutomation();

  const [view, setView] = React.useState<"list" | "runs">("list");
  const [selectedAutomation, setSelectedAutomation] =
    React.useState<Automation | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  );
  const [dispatchingId, setDispatchingId] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const { data: runsData, isLoading: isLoadingRuns } = useListAutomationRuns(
    view === "runs" ? (selectedAutomation?.id ?? null) : null,
  );

  const handleToggleEnabled = (automation: Automation) => {
    setTogglingId(automation.id);
    updateAutomation(
      {
        automationId: automation.id,
        body: { enabled: !automation.enabled },
      },
      {
        onSuccess: () => {
          displaySuccessToast(
            `Automation ${automation.enabled ? "disabled" : "enabled"}`,
          );
          setTogglingId(null);
        },
        onError: () => {
          displayErrorToast("Failed to update automation");
          setTogglingId(null);
        },
      },
    );
  };

  const handleDispatch = (automation: Automation) => {
    setDispatchingId(automation.id);
    dispatchAutomation(automation.id, {
      onSuccess: () => {
        displaySuccessToast(`Run dispatched for "${automation.name}"`);
        setDispatchingId(null);
      },
      onError: () => {
        displayErrorToast("Failed to dispatch automation");
        setDispatchingId(null);
      },
    });
  };

  const handleViewRuns = (automation: Automation) => {
    setSelectedAutomation(automation);
    setView("runs");
  };

  const handleDelete = () => {
    if (!confirmDeleteId) return;
    deleteAutomation(confirmDeleteId, {
      onSuccess: () => {
        displaySuccessToast("Automation deleted");
        setConfirmDeleteId(null);
      },
      onError: () => {
        displayErrorToast("Failed to delete automation");
        setConfirmDeleteId(null);
      },
    });
  };

  const automations = data?.automations ?? [];

  if (view === "runs" && selectedAutomation) {
    return (
      <div
        data-testid="automations-settings-screen"
        className="flex flex-col gap-5"
      >
        <AutomationRunsPanel
          automationName={selectedAutomation.name}
          runs={runsData?.runs ?? []}
          total={runsData?.total ?? 0}
          isLoading={isLoadingRuns}
          onBack={() => {
            setView("list");
            setSelectedAutomation(null);
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="automations-settings-screen"
      className="flex flex-col gap-5"
    >
      {isLoading && (
        <div className="border border-tertiary rounded-md overflow-hidden">
          <AutomationListItemSkeleton />
          <AutomationListItemSkeleton />
          <AutomationListItemSkeleton />
        </div>
      )}

      {!isLoading && automations.length === 0 && (
        <div className="border border-tertiary rounded-md p-8 text-center">
          <p className="text-sm text-content-2 opacity-60">
            {t(I18nKey.AUTOMATIONS$EMPTY_STATE)}
          </p>
          <p className="text-xs text-content-2 opacity-40 mt-2">
            {t(I18nKey.AUTOMATIONS$EMPTY_STATE_HINT)}
          </p>
        </div>
      )}

      {!isLoading && automations.length > 0 && (
        <div className="border border-tertiary rounded-md overflow-hidden">
          <table className="w-full min-w-full table-fixed">
            <thead className="bg-base-tertiary">
              <tr>
                <th className="w-[25%] text-left p-3 text-sm font-medium">
                  {t(I18nKey.SETTINGS$NAME)}
                </th>
                <th className="w-[25%] text-left p-3 text-sm font-medium">
                  {t(I18nKey.AUTOMATIONS$SCHEDULE)}
                </th>
                <th className="w-[12%] text-left p-3 text-sm font-medium">
                  {t(I18nKey.AUTOMATIONS$STATUS)}
                </th>
                <th className="w-[18%] text-left p-3 text-sm font-medium">
                  {t(I18nKey.AUTOMATIONS$LAST_RUN)}
                </th>
                <th className="w-[20%] text-right p-3 text-sm font-medium">
                  {t(I18nKey.SETTINGS$ACTIONS)}
                </th>
              </tr>
            </thead>
            <tbody>
              {automations.map((automation) => (
                <AutomationListItem
                  key={automation.id}
                  automation={automation}
                  onToggleEnabled={() => handleToggleEnabled(automation)}
                  onDispatch={() => handleDispatch(automation)}
                  onViewRuns={() => handleViewRuns(automation)}
                  onDelete={() => setConfirmDeleteId(automation.id)}
                  isDispatching={dispatchingId === automation.id}
                  isToggling={togglingId === automation.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmationModal
          text={t(I18nKey.AUTOMATIONS$CONFIRM_DELETE)}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

export default AutomationsSettingsScreen;
