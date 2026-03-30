import React from "react";
import { LikertScale } from "../../feedback/likert-scale";

interface LikertScaleWrapperProps {
  eventId: string | number;
  isErrorEvent?: boolean;
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

export function LikertScaleWrapper({
  eventId,
  isErrorEvent = false,
  isLastMessage,
  isInLast10Actions,
  config,
  isCheckingFeedback,
  feedbackData,
}: LikertScaleWrapperProps) {
  if (config?.app_mode !== "saas" || isCheckingFeedback) {
    return null;
  }

  const shouldShow = isErrorEvent ? isInLast10Actions : isLastMessage;

  if (!shouldShow) {
    return null;
  }

  return (
    <LikertScale
      eventId={eventId}
      initiallySubmitted={feedbackData.exists}
      initialRating={feedbackData.rating}
      initialReason={feedbackData.reason}
    />
  );
}
