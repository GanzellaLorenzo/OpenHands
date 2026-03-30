import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useConfig } from "#/hooks/query/use-config";
import {
  BatchFeedbackData,
  FeedbackEventId,
  getFeedbackExistsQueryKey,
  getFeedbackQueryKey,
} from "./use-batch-feedback";

export type FeedbackData = BatchFeedbackData;

export const useFeedbackExists = (eventId?: FeedbackEventId) => {
  const queryClient = useQueryClient();
  const { conversationId } = useConversationId();
  const { data: config } = useConfig();

  return useQuery<FeedbackData>({
    queryKey: getFeedbackExistsQueryKey(conversationId, eventId),
    queryFn: () => {
      if (eventId === undefined || eventId === null) {
        return { exists: false };
      }

      const batchData = queryClient.getQueryData<
        Record<string, BatchFeedbackData>
      >(getFeedbackQueryKey(conversationId));

      return batchData?.[eventId.toString()] ?? { exists: false };
    },
    enabled:
      eventId !== undefined &&
      eventId !== null &&
      !!conversationId &&
      config?.app_mode === "saas",
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });
};
