import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AutomationService } from "#/api/automation-service";

export const useDispatchAutomation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (automationId: string) =>
      AutomationService.dispatchAutomation(automationId),
    onSuccess: (_data, automationId) => {
      queryClient.invalidateQueries({
        queryKey: ["automation-runs", automationId],
      });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
};
