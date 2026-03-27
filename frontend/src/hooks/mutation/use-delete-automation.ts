import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AutomationService } from "#/api/automation-service";

export const useDeleteAutomation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (automationId: string) =>
      AutomationService.deleteAutomation(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
};
