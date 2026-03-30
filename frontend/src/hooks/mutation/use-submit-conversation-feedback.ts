import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { useConversationId } from "#/hooks/use-conversation-id";
import {
  BatchFeedbackData,
  FeedbackEventId,
  getFeedbackQueryKey,
} from "../query/use-batch-feedback";

type SubmitConversationFeedbackArgs = {
  rating: number;
  eventId?: FeedbackEventId;
  reason?: string;
};

export const useSubmitConversationFeedback = () => {
  const { conversationId } = useConversationId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rating, eventId, reason }: SubmitConversationFeedbackArgs) =>
      ConversationService.submitConversationFeedback(
        conversationId,
        rating,
        eventId,
        reason,
      ),
    onMutate: async ({ rating, eventId, reason }) => {
      if (eventId === undefined || eventId === null) {
        return { previousFeedback: null };
      }

      const queryKey = getFeedbackQueryKey(conversationId);

      await queryClient.cancelQueries({ queryKey });

      const previousFeedback =
        queryClient.getQueryData<Record<string, BatchFeedbackData>>(queryKey);

      queryClient.setQueryData<Record<string, BatchFeedbackData>>(
        queryKey,
        (old = {}) => ({
          ...old,
          [eventId.toString()]: {
            exists: true,
            rating,
            reason,
            metadata: { source: "likert-scale" },
          },
        }),
      );

      return { previousFeedback };
    },
    onError: (error, { eventId }, context) => {
      if (
        context?.previousFeedback &&
        eventId !== undefined &&
        eventId !== null
      ) {
        queryClient.setQueryData(
          getFeedbackQueryKey(conversationId),
          context.previousFeedback,
        );
      }
      // eslint-disable-next-line no-console
      console.error(error);
    },
    onSettled: (_, __, { eventId }) => {
      if (eventId !== undefined && eventId !== null) {
        queryClient.invalidateQueries({
          queryKey: getFeedbackQueryKey(conversationId),
        });
      }
    },
  });
};
