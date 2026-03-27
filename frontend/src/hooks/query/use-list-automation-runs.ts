import { useQuery } from "@tanstack/react-query";
import { AutomationService } from "#/api/automation-service";
import { useIsAuthed } from "#/hooks/query/use-is-authed";

export const useListAutomationRuns = (automationId: string | null) => {
  const { data: isAuthed } = useIsAuthed();

  return useQuery({
    queryKey: ["automation-runs", automationId],
    queryFn: () => AutomationService.listAutomationRuns(automationId!),
    enabled: !!isAuthed && !!automationId,
  });
};
