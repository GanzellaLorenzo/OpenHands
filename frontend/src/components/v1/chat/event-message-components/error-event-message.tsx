import React from "react";
import { AgentErrorEvent } from "#/types/v1/core";
import { isAgentErrorEvent } from "#/types/v1/type-guards";
import { ErrorMessage } from "../../../features/chat/error-message";
import { MicroagentStatusWrapper } from "../../../features/chat/event-message-components/microagent-status-wrapper";
import { LikertScaleWrapper } from "../../../features/chat/event-message-components/likert-scale-wrapper";
import { MicroagentStatus } from "#/types/microagent-status";

interface ErrorEventMessageProps {
  event: AgentErrorEvent;
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
}

export function ErrorEventMessage({
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
}: ErrorEventMessageProps) {
  if (!isAgentErrorEvent(event)) {
    return null;
  }

  return (
    <div>
      <ErrorMessage
        // V1 doesn't have error_id, use event.id instead
        errorId={event.id}
        defaultMessage={event.error}
      />
      <MicroagentStatusWrapper
        microagentStatus={microagentStatus}
        microagentConversationId={microagentConversationId}
        microagentPRUrl={microagentPRUrl}
        actions={actions}
      />
      <LikertScaleWrapper
        eventId={event.id}
        isErrorEvent
        isLastMessage={isLastMessage}
        isInLast10Actions={isInLast10Actions}
        config={config}
        isCheckingFeedback={isCheckingFeedback}
        feedbackData={feedbackData}
      />
    </div>
  );
}
