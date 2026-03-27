import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AutomationService } from "#/api/automation-service";
import { UpdateAutomationRequest } from "#/api/automation-service.types";

export const useUpdateAutomation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      automationId,
      body,
    }: {
      automationId: string;
      body: UpdateAutomationRequest;
    }) => AutomationService.updateAutomation(automationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
};
