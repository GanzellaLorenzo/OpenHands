import React from "react";
import { ActionEvent } from "#/types/v1/core";
import { FinishAction } from "#/types/v1/core/base/action";
import { ChatMessage } from "../../../features/chat/chat-message";
import { MicroagentStatusWrapper } from "../../../features/chat/event-message-components/microagent-status-wrapper";
import { LikertScaleWrapper } from "../../../features/chat/event-message-components/likert-scale-wrapper";
import { getEventContent } from "../event-content-helpers/get-event-content";
import { MicroagentStatus } from "#/types/microagent-status";

interface FinishEventMessageProps {
  event: ActionEvent<FinishAction>;
  microagentStatus?: MicroagentStatus | null;
  microagentConversationId?: string;
  microagentPRUrl?: string;
  actions?: Array<{
    icon: React.ReactNode;
    onClick: () => void;
    tooltip?: string;
  }>;
  isLastMessage: boolean;
  isInLast10Actions: boolean;
  config?: { app_mode?: string } | null;
  isCheckingFeedback: boolean;
  feedbackData: {
    exists: boolean;
    rating?: number;
    reason?: string;
  };
  isFromPlanningAgent?: boolean;
}

export function FinishEventMessage({
  event,
  microagentStatus,
  microagentConversationId,
  microagentPRUrl,
  actions,
  isLastMessage,
  isInLast10Actions,
  config,
  isCheckingFeedback,
  feedbackData,
  isFromPlanningAgent = false,
}: FinishEventMessageProps) {
  const eventContent = getEventContent(event);
  // For FinishAction, details is always a string (getActionContent returns string)
  const message =
    typeof eventContent.details === "string"
      ? eventContent.details
      : String(eventContent.details);

  return (
    <>
      <ChatMessage
        type="agent"
        message={message}
        actions={actions}
        isFromPlanningAgent={isFromPlanningAgent}
      />
      <MicroagentStatusWrapper
        microagentStatus={microagentStatus}
        microagentConversationId={microagentConversationId}
        microagentPRUrl={microagentPRUrl}
        actions={actions}
      />
      <LikertScaleWrapper
        eventId={event.id}
        isLastMessage={isLastMessage}
        isInLast10Actions={isInLast10Actions}
        config={config}
        isCheckingFeedback={isCheckingFeedback}
        feedbackData={feedbackData}
      />
    </>
  );
}
