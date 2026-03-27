import { useQuery } from "@tanstack/react-query";
import { AutomationService } from "#/api/automation-service";
import { useIsAuthed } from "#/hooks/query/use-is-authed";

export const useListAutomations = () => {
  const { data: isAuthed } = useIsAuthed();

  return useQuery({
    queryKey: ["automations"],
    queryFn: () => AutomationService.listAutomations(),
    enabled: !!isAuthed,
  });
};
