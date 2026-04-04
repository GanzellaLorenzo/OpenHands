import { useQuery } from "@tanstack/react-query";
import EventService from "#/api/event-service/event-service.api";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { OpenHandsEvent } from "#/types/v1/core";

export interface ConversationHistoryResult {
  events: OpenHandsEvent[];
  /**
   * The oldest timestamp from preloaded events, used for WebSocket handoff.
   * WebSocket should use after_timestamp to only receive events newer than this.
   */
  oldestTimestamp: string | null;
}

export const useConversationHistory = (conversationId?: string) => {
  const { data: conversation } = useUserConversation(conversationId ?? null);
  const conversationVersion = conversation?.conversation_version;

  return useQuery({
    queryKey: ["conversation-history", conversationId, conversationVersion],
    enabled: !!conversationId && !!conversation,
    queryFn: async (): Promise<ConversationHistoryResult> => {
      if (!conversationId || !conversationVersion) {
        return { events: [], oldestTimestamp: null };
      }

      if (conversationVersion === "V1") {
        // Fetch newest events first for instant perceived load.
        // User sees current conversation state immediately.
        // NOTE: Currently limited to 100 most recent events for performance.
        // Older events (if any) will be loaded via WebSocket resend_all.
        // TODO(#12705): Implement cursor-based background pagination for >100 events.
        const result = await EventService.searchEventsV1(conversationId, {
          sort_order: "TIMESTAMP_DESC",
          limit: 100,
        });

        // Extract oldest timestamp for WebSocket handoff.
        // Events are sorted DESC (newest first), so last item has oldest timestamp.
        // WebSocket will use after_timestamp to only send events >= this timestamp,
        // ensuring no duplicates while also catching any events created during the
        // brief window between REST fetch and WebSocket connect (server timestamps
        // are monotonically increasing, so no race condition).
        const oldestTimestamp =
          result.items.length > 0
            ? result.items[result.items.length - 1].timestamp
            : null;

        return {
          events: result.items,
          oldestTimestamp,
        };
      }

      // V0 conversations - legacy behavior (no bi-directional loading)
      const events = await EventService.searchEventsV0(conversationId);
      return { events, oldestTimestamp: null };
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes — survive navigation away and back (AC5)
  });
};
