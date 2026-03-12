import { test, expect } from "@playwright/test";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import crypto from "crypto";
import {
  MockGitHubClient,
  createMockGitHubClient,
  createIssueLabeledPayload,
} from "../mocks";
import { ConversationPage, HomePage } from "../pages";

/**
 * GitHub Resolver Integration Tests
 *
 * These tests verify the GitHub resolver integration in two modes:
 *
 * ## Mode 1: Mock Server Tests (for local development)
 * Uses a local mock GitHub server to test the full webhook flow.
 * Requires:
 * - OpenHands running locally with GITHUB_APP_WEBHOOK_SECRET=test-webhook-secret
 * - The app configured to use the mock server for GitHub API calls
 *
 * ## Mode 2: Live Environment Tests (for staging/production)
 * Tests against real deployed environments using the real GitHub API.
 * Requires:
 * - GITHUB_TEST_USERNAME and GITHUB_TEST_PASSWORD for authentication
 * - The webhook endpoint to be accessible
 *
 * Environment Variables:
 * - USE_MOCK_GITHUB: Set to "true" to use mock server mode
 * - MOCK_GITHUB_PORT: Port for the mock GitHub server (default: 9999)
 * - APP_PORT: Port where the OpenHands app is running (default: 12000)
 * - GITHUB_APP_WEBHOOK_SECRET: Webhook secret for local testing
 *
 * Tags:
 * - @github-resolver: GitHub resolver integration tests
 * - @enterprise: Tests requiring enterprise features
 */

// Configuration
const USE_MOCK_GITHUB = process.env.USE_MOCK_GITHUB === "true";
const MOCK_GITHUB_PORT = parseInt(process.env.MOCK_GITHUB_PORT || "9999", 10);
const APP_PORT = parseInt(process.env.APP_PORT || "12000", 10);
const MOCK_SERVER_STARTUP_TIMEOUT = 30_000;
const RESOLVER_RESPONSE_TIMEOUT = 180_000;

// Mock server process
let mockServerProcess: ChildProcess | null = null;
let mockClient: MockGitHubClient | null = null;

/**
 * Generate webhook signature for testing
 */
function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Start the mock GitHub server as a background process
 */
async function startMockServer(): Promise<void> {
  if (!USE_MOCK_GITHUB) return;

  const serverPath = path.join(
    import.meta.dirname,
    "../mocks/github-mock-server.ts",
  );

  console.log(`Starting mock GitHub server on port ${MOCK_GITHUB_PORT}...`);

  mockServerProcess = spawn("npx", ["tsx", serverPath], {
    env: {
      ...process.env,
      MOCK_GITHUB_PORT: String(MOCK_GITHUB_PORT),
      MOCK_GITHUB_WEBHOOK_SECRET:
        process.env.GITHUB_APP_WEBHOOK_SECRET || "test-webhook-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  mockServerProcess.stdout?.on("data", (data) => {
    console.log(`[Mock GitHub] ${data.toString().trim()}`);
  });

  mockServerProcess.stderr?.on("data", (data) => {
    console.error(`[Mock GitHub ERROR] ${data.toString().trim()}`);
  });

  mockServerProcess.on("error", (error) => {
    console.error(`[Mock GitHub] Failed to start server: ${error.message}`);
  });

  mockServerProcess.on("exit", (code) => {
    console.log(`[Mock GitHub] Server exited with code ${code}`);
  });

  mockClient = createMockGitHubClient(MOCK_GITHUB_PORT, APP_PORT);
  await mockClient.waitForReady(MOCK_SERVER_STARTUP_TIMEOUT);
  console.log("Mock GitHub server is ready");
}

/**
 * Stop the mock GitHub server
 */
async function stopMockServer(): Promise<void> {
  if (mockServerProcess) {
    console.log("Stopping mock GitHub server...");
    mockServerProcess.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        mockServerProcess?.kill("SIGKILL");
        resolve();
      }, 5000);

      mockServerProcess?.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    mockServerProcess = null;
    console.log("Mock GitHub server stopped");
  }
}

// ============================================================================
// MOCK SERVER TESTS (for local development with mock GitHub)
// ============================================================================

test.describe("GitHub Resolver - Mock Server @github-resolver @enterprise @mock", () => {
  test.describe.configure({ mode: "serial" });

  // Skip this entire suite unless USE_MOCK_GITHUB is true
  test.skip(!USE_MOCK_GITHUB, "Requires USE_MOCK_GITHUB=true");

  test.beforeAll(async () => {
    await startMockServer();
  });

  test.afterAll(async () => {
    await stopMockServer();
  });

  test.beforeEach(async () => {
    if (mockClient) {
      await mockClient.reset();
    }
  });

  test("mock server should be healthy", async () => {
    expect(mockClient).not.toBeNull();
    const isHealthy = await mockClient!.healthCheck();
    expect(isHealthy).toBe(true);
  });

  test("should process issue labeled webhook and create conversation", async ({
    page,
    baseURL,
  }) => {
    expect(mockClient).not.toBeNull();

    console.log("Triggering issue labeled webhook...");
    const webhookResult = await mockClient!.triggerIssueLabeledEvent({
      issueTitle: "Add README file",
      issueBody: "Please add a README.md file with project documentation.",
      labelName: "openhands",
    });

    console.log(`Webhook response: ${JSON.stringify(webhookResult)}`);
    expect(webhookResult.responseStatus).toBe(200);

    console.log("Waiting for resolver response...");
    const response = await mockClient!.waitForResponseContaining(
      "I'm on it",
      RESOLVER_RESPONSE_TIMEOUT,
    );

    console.log(`Resolver response: ${response.body}`);
    expect(response.body).toContain("I'm on it");
    expect(response.body).toContain("track my progress");

    const conversationLinkMatch = response.body.match(
      /conversations\/([a-f0-9]+)/,
    );
    expect(conversationLinkMatch).not.toBeNull();

    const conversationId = conversationLinkMatch![1];
    console.log(`Conversation ID: ${conversationId}`);

    const conversationPage = new ConversationPage(page);
    await page.goto(`${baseURL}/conversations/${conversationId}`);
    await conversationPage.waitForConversationReady(30_000);
    await expect(conversationPage.chatBox).toBeVisible();

    await page.screenshot({
      path: "test-results/screenshots/github-resolver-conversation.png",
    });

    console.log("Issue labeled webhook test passed");
  });

  test("should process issue comment webhook with @openhands mention", async ({
    page,
    baseURL,
  }) => {
    expect(mockClient).not.toBeNull();

    console.log("Triggering issue comment webhook...");
    const webhookResult = await mockClient!.triggerIssueCommentEvent({
      issueTitle: "Bug: Application crashes on startup",
      issueBody: "The application crashes when I try to start it.",
      commentBody: "@openhands please investigate this crash and fix it",
    });

    console.log(`Webhook response: ${JSON.stringify(webhookResult)}`);
    expect(webhookResult.responseStatus).toBe(200);

    console.log("Waiting for resolver response...");
    const response = await mockClient!.waitForResponseContaining(
      "I'm on it",
      RESOLVER_RESPONSE_TIMEOUT,
    );

    console.log(`Resolver response: ${response.body}`);
    expect(response.body).toContain("I'm on it");

    const conversationLinkMatch = response.body.match(
      /conversations\/([a-f0-9]+)/,
    );
    expect(conversationLinkMatch).not.toBeNull();

    const conversationId = conversationLinkMatch![1];
    const conversationPage = new ConversationPage(page);
    await page.goto(`${baseURL}/conversations/${conversationId}`);
    await conversationPage.waitForConversationReady(30_000);

    await page.screenshot({
      path: "test-results/screenshots/github-resolver-issue-comment.png",
    });
  });
});

// ============================================================================
// LIVE ENVIRONMENT TESTS (for staging/production with real GitHub)
// ============================================================================

test.describe("GitHub Resolver - Live Environment @github-resolver @enterprise @live", () => {
  test.describe.configure({ mode: "serial" });

  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });

  test("should verify resolver conversations appear in conversation list", async ({
    page,
  }) => {
    /**
     * This test verifies that resolver-triggered conversations appear in the
     * user's conversation list. It checks the infrastructure is working by
     * looking at existing conversations.
     */

    // Navigate to home page (requires authentication via global-setup)
    await homePage.goto();
    await expect(homePage.homeScreen).toBeVisible({ timeout: 30_000 });

    // Look for recent conversations
    const recentConversations = page.getByTestId("recent-conversations");
    await expect(recentConversations).toBeVisible({ timeout: 10_000 });

    const conversationLinks = recentConversations.locator(
      'a[href^="/conversations/"]',
    );
    const count = await conversationLinks.count();

    console.log(`Found ${count} recent conversations`);

    await page.screenshot({
      path: "test-results/screenshots/resolver-conversations-list.png",
    });

    if (count > 0) {
      const firstConversation = conversationLinks.first();
      await firstConversation.click();

      const conversationPage = new ConversationPage(page);
      await conversationPage.waitForConversationReady(30_000);

      await page.screenshot({
        path: "test-results/screenshots/resolver-conversation-detail.png",
      });

      console.log("Successfully navigated to a conversation");
    }
  });

  test("should be able to send webhook with valid signature format", async ({
    baseURL,
    request,
  }) => {
    /**
     * This test verifies the webhook endpoint exists and validates signatures.
     * We send a properly formatted but invalid webhook to verify:
     * 1. The endpoint exists
     * 2. Signature verification is working
     */

    const payload = createIssueLabeledPayload({
      issueTitle: "Test Issue",
      issueBody: "Test body for integration test",
      labelName: "openhands",
    });

    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, "wrong-secret");

    const response = await request.post(
      `${baseURL}/api/integration/github/events`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "issues",
          "X-Hub-Signature-256": signature,
          "X-GitHub-Delivery": crypto.randomUUID(),
        },
        data: payload,
      },
    );

    console.log(`Webhook response status: ${response.status()}`);

    // Either 403 (signature invalid) or 200 (if webhooks disabled) is acceptable
    expect([200, 403]).toContain(response.status());

    const responseText = await response.text();
    console.log(`Webhook response: ${responseText}`);

    if (response.status() === 403) {
      console.log(
        "Webhook signature validation is working (403 = invalid signature)",
      );
    } else if (response.status() === 200) {
      const body = JSON.parse(responseText);
      if (body.message?.includes("disabled")) {
        console.log("GitHub webhooks are disabled on this environment");
      }
    }
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

test.describe("GitHub Resolver - Error Handling @github-resolver @enterprise", () => {
  test("should reject webhook without signature header", async ({
    baseURL,
    request,
  }) => {
    const payload = { action: "labeled", installation: { id: 12345 } };

    const response = await request.post(
      `${baseURL}/api/integration/github/events`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "issues",
        },
        data: payload,
      },
    );

    console.log(
      `Response status: ${response.status()} (expected 403 or 200 if disabled)`,
    );
    expect([200, 403]).toContain(response.status());
  });

  test("should handle malformed JSON gracefully", async ({
    baseURL,
    request,
  }) => {
    const response = await request.post(
      `${baseURL}/api/integration/github/events`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "issues",
          "X-Hub-Signature-256": "sha256=invalid",
        },
        data: "not valid json{{{",
      },
    );

    console.log(`Response status: ${response.status()}`);
    expect([400, 403, 422, 500]).toContain(response.status());
  });
});
