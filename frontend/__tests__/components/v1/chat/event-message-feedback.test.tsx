import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { EventMessage } from "#/components/v1/chat/event-message";
import { AgentState } from "#/types/agent-state";
import { renderWithProviders } from "test-utils";

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => ({
    data: { app_mode: "saas" },
  }),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: () => ({ conversationId: "test-conversation-id" }),
}));

vi.mock("#/components/shared/buttons/v1-confirmation-buttons", () => ({
  V1ConfirmationButtons: () => <div data-testid="v1-confirmation-buttons" />,
}));


vi.mock("#/hooks/query/use-feedback-exists", () => ({
  useFeedbackExists: () => ({
    data: { exists: false },
    isLoading: false,
  }),
}));

vi.mock("#/hooks/use-agent-state", () => ({
  useAgentState: () => ({
    curAgentState: AgentState.INIT,
  }),
}));

describe("V1 EventMessage feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders star feedback for the last assistant message", () => {
    const event = {
      id: "message-1",
      timestamp: new Date().toISOString(),
      source: "agent" as const,
      llm_message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello from the agent" }],
      },
      activated_microagents: [],
      extended_content: [],
    };

    renderWithProviders(
      <EventMessage
        event={event as any}
        messages={[]}
        isLastMessage={true}
        isInLast10Actions={true}
      />,
    );

    expect(screen.getByLabelText("Rate 1 stars")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate 5 stars")).toBeInTheDocument();
  });

  it("renders star feedback for the last finish action", () => {
    const event = {
      id: "finish-1",
      timestamp: new Date().toISOString(),
      source: "agent" as const,
      thought: [{ type: "text" as const, text: "Done" }],
      thinking_blocks: [],
      action: {
        kind: "FinishAction" as const,
        thought: "Done",
        message: "Task completed successfully",
        outputs: {},
      },
      tool_name: "finish",
      tool_call_id: "call-1",
    };

    renderWithProviders(
      <EventMessage
        event={event as any}
        messages={[]}
        isLastMessage={true}
        isInLast10Actions={true}
      />,
    );

    expect(screen.getByLabelText("Rate 1 stars")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate 5 stars")).toBeInTheDocument();
  });

  it("renders star feedback for V1 errors in the last 10 actions", () => {
    const event = {
      id: "error-1",
      timestamp: new Date().toISOString(),
      source: "agent" as const,
      tool_name: "execute_bash",
      tool_call_id: "call-1",
      error: "Command failed",
    };

    renderWithProviders(
      <EventMessage
        event={event as any}
        messages={[]}
        isLastMessage={false}
        isInLast10Actions={true}
      />,
    );

    expect(screen.getByLabelText("Rate 1 stars")).toBeInTheDocument();
    expect(screen.getByLabelText("Rate 5 stars")).toBeInTheDocument();
  });

  it("does not render star feedback for user messages", () => {
    const event = {
      id: "user-1",
      timestamp: new Date().toISOString(),
      source: "user" as const,
      llm_message: {
        role: "user" as const,
        content: [{ type: "text" as const, text: "A user message" }],
      },
      activated_microagents: [],
      extended_content: [],
    };

    renderWithProviders(
      <EventMessage
        event={event as any}
        messages={[]}
        isLastMessage={true}
        isInLast10Actions={true}
      />,
    );

    expect(screen.queryByLabelText("Rate 1 stars")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rate 5 stars")).not.toBeInTheDocument();
  });
});
