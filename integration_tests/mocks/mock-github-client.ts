/**
 * Mock GitHub Client
 *
 * Client utilities for interacting with the mock GitHub server during tests.
 */

import {
  createIssueLabeledPayload,
  createIssueCommentPayload,
  createPullRequestReviewCommentPayload,
  getEventType,
  GitHubWebhookPayload,
} from "./github-webhook-payloads";

export interface MockGitHubClientConfig {
  mockServerUrl: string;
  webhookTargetUrl: string;
}

export interface TriggerWebhookResult {
  status: string;
  targetUrl: string;
  eventType: string;
  responseStatus: number;
  responseBody: string;
}

export interface WebhookEvent {
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface OutgoingResponse {
  body: string;
  timestamp: string;
}

/**
 * Client for interacting with the Mock GitHub Server
 */
export class MockGitHubClient {
  private mockServerUrl: string;

  private webhookTargetUrl: string;

  constructor(config: MockGitHubClientConfig) {
    this.mockServerUrl = config.mockServerUrl;
    this.webhookTargetUrl = config.webhookTargetUrl;
  }

  /**
   * Check if the mock server is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.mockServerUrl}/_health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for the mock server to be ready
   */
  async waitForReady(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (await this.healthCheck()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Mock GitHub server not ready after ${timeoutMs}ms`);
  }

  /**
   * Trigger a webhook to the target URL
   */
  async triggerWebhook(
    payload: GitHubWebhookPayload,
  ): Promise<TriggerWebhookResult> {
    const eventType = getEventType(payload);

    const response = await fetch(
      `${this.mockServerUrl}/_test/trigger-webhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: this.webhookTargetUrl,
          eventType,
          payload,
        }),
      },
    );

    return response.json();
  }

  /**
   * Trigger an issue labeled event (simulates adding the openhands label)
   */
  async triggerIssueLabeledEvent(
    params?: Parameters<typeof createIssueLabeledPayload>[0],
  ): Promise<TriggerWebhookResult> {
    const payload = createIssueLabeledPayload(params || {});
    return this.triggerWebhook(payload);
  }

  /**
   * Trigger an issue comment event (simulates @openhands mention in issue)
   */
  async triggerIssueCommentEvent(
    params?: Parameters<typeof createIssueCommentPayload>[0],
  ): Promise<TriggerWebhookResult> {
    const payload = createIssueCommentPayload(params || {});
    return this.triggerWebhook(payload);
  }

  /**
   * Trigger a PR review comment event (simulates @openhands mention in PR)
   */
  async triggerPRReviewCommentEvent(
    params?: Parameters<typeof createPullRequestReviewCommentPayload>[0],
  ): Promise<TriggerWebhookResult> {
    const payload = createPullRequestReviewCommentPayload(params || {});
    return this.triggerWebhook(payload);
  }

  /**
   * Get all recorded webhook events
   */
  async getWebhookEvents(): Promise<WebhookEvent[]> {
    const response = await fetch(`${this.mockServerUrl}/_test/webhook-events`);
    return response.json();
  }

  /**
   * Get all outgoing responses (comments posted by the resolver)
   */
  async getOutgoingResponses(): Promise<OutgoingResponse[]> {
    const response = await fetch(
      `${this.mockServerUrl}/_test/outgoing-responses`,
    );
    return response.json();
  }

  /**
   * Clear all recorded events
   */
  async clearEvents(): Promise<void> {
    await fetch(`${this.mockServerUrl}/_test/clear-events`, { method: "POST" });
  }

  /**
   * Reset all mock data to initial state
   */
  async reset(): Promise<void> {
    await fetch(`${this.mockServerUrl}/_test/reset`, { method: "POST" });
  }

  /**
   * Wait for the resolver to post a response
   * @param timeoutMs Maximum time to wait
   * @param expectedCount Number of responses to wait for (default: 1)
   * @param checkIntervalMs How often to check for responses
   */
  async waitForResponse(
    timeoutMs = 120000,
    expectedCount = 1,
    checkIntervalMs = 2000,
  ): Promise<OutgoingResponse[]> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const responses = await this.getOutgoingResponses();
      if (responses.length >= expectedCount) {
        return responses;
      }
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
    throw new Error(
      `Timed out waiting for ${expectedCount} response(s) after ${timeoutMs}ms`,
    );
  }

  /**
   * Wait for a response containing specific text
   */
  async waitForResponseContaining(
    expectedText: string,
    timeoutMs = 120000,
    checkIntervalMs = 2000,
  ): Promise<OutgoingResponse> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const responses = await this.getOutgoingResponses();
      for (const response of responses) {
        if (response.body.includes(expectedText)) {
          return response;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
    throw new Error(
      `Timed out waiting for response containing "${expectedText}" after ${timeoutMs}ms`,
    );
  }
}

/**
 * Create a MockGitHubClient with default configuration
 */
export function createMockGitHubClient(
  mockServerPort = 9999,
  appPort = 12000,
): MockGitHubClient {
  return new MockGitHubClient({
    mockServerUrl: `http://localhost:${mockServerPort}`,
    webhookTargetUrl: `http://localhost:${appPort}/api/integration/github/events`,
  });
}
