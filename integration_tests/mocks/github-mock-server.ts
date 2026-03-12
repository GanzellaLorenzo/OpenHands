/**
 * Mock GitHub Server for Integration Testing
 *
 * This server simulates GitHub API endpoints used by the OpenHands resolver:
 * - GitHub App webhooks (issue labeled, issue comment, PR comment, etc.)
 * - GitHub REST API endpoints (repos, issues, comments, pulls)
 * - GitHub GraphQL API
 *
 * The mock server allows testing the resolver integration without connecting
 * to the real GitHub service.
 */

import http from "http";
import crypto from "crypto";

// Types for mock data
interface MockIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: Array<{ name: string; id: number }>;
  user: { login: string; id: number };
  created_at: string;
  updated_at: string;
  comments: MockComment[];
  reactions: string[];
}

interface MockComment {
  id: number;
  body: string;
  user: { login: string; id: number };
  created_at: string;
}

interface MockRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string; id: number };
  default_branch: string;
  node_id: string;
}

interface MockInstallation {
  id: number;
  account: { login: string; id: number };
  repositories: MockRepository[];
  access_token: string;
}

interface WebhookEvent {
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// Mock data store
class MockGitHubDataStore {
  private repositories: Map<string, MockRepository> = new Map();

  private issues: Map<string, Map<number, MockIssue>> = new Map();

  private installations: Map<number, MockInstallation> = new Map();

  private webhookEvents: WebhookEvent[] = [];

  private nextCommentId = 1000;

  private outgoingWebhookResponses: Array<{
    body: string;
    timestamp: string;
  }> = [];

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Create a default test repository
    const testRepo: MockRepository = {
      id: 123456789,
      name: "test-repo",
      full_name: "test-owner/test-repo",
      private: false,
      owner: { login: "test-owner", id: 1000 },
      default_branch: "main",
      node_id: "R_kgDOTest123",
    };
    this.repositories.set(testRepo.full_name, testRepo);

    // Create a test issue
    const testIssue: MockIssue = {
      number: 1,
      title: "Test Issue for OpenHands Resolver",
      body: "This is a test issue to verify the resolver integration works correctly. Please add a README file.",
      state: "open",
      labels: [],
      user: { login: "test-user", id: 2000 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      comments: [],
      reactions: [],
    };
    this.issues.set(testRepo.full_name, new Map([[1, testIssue]]));

    // Create a default installation
    const testInstallation: MockInstallation = {
      id: 12345,
      account: { login: "test-owner", id: 1000 },
      repositories: [testRepo],
      access_token: "ghs_mock_installation_token_12345",
    };
    this.installations.set(testInstallation.id, testInstallation);
  }

  getRepository(fullName: string): MockRepository | undefined {
    return this.repositories.get(fullName);
  }

  getIssue(fullName: string, issueNumber: number): MockIssue | undefined {
    return this.issues.get(fullName)?.get(issueNumber);
  }

  getIssues(fullName: string): MockIssue[] {
    const repoIssues = this.issues.get(fullName);
    return repoIssues ? Array.from(repoIssues.values()) : [];
  }

  addComment(
    fullName: string,
    issueNumber: number,
    body: string,
    user: { login: string; id: number },
  ): MockComment {
    const issue = this.getIssue(fullName, issueNumber);
    if (!issue) throw new Error(`Issue not found: ${fullName}#${issueNumber}`);

    const comment: MockComment = {
      id: this.nextCommentId++,
      body,
      user,
      created_at: new Date().toISOString(),
    };
    issue.comments.push(comment);
    issue.updated_at = new Date().toISOString();
    return comment;
  }

  addReaction(fullName: string, issueNumber: number, reaction: string): void {
    const issue = this.getIssue(fullName, issueNumber);
    if (issue) {
      issue.reactions.push(reaction);
    }
  }

  addLabel(fullName: string, issueNumber: number, label: string): void {
    const issue = this.getIssue(fullName, issueNumber);
    if (issue) {
      issue.labels.push({ name: label, id: Date.now() });
      issue.updated_at = new Date().toISOString();
    }
  }

  getInstallation(id: number): MockInstallation | undefined {
    return this.installations.get(id);
  }

  getAllRepositories(): MockRepository[] {
    return Array.from(this.repositories.values());
  }

  recordWebhookEvent(action: string, payload: Record<string, unknown>): void {
    this.webhookEvents.push({
      action,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  getWebhookEvents(): WebhookEvent[] {
    return this.webhookEvents;
  }

  recordOutgoingWebhookResponse(body: string): void {
    this.outgoingWebhookResponses.push({
      body,
      timestamp: new Date().toISOString(),
    });
  }

  getOutgoingWebhookResponses(): Array<{ body: string; timestamp: string }> {
    return this.outgoingWebhookResponses;
  }

  clearEvents(): void {
    this.webhookEvents = [];
    this.outgoingWebhookResponses = [];
  }

  reset(): void {
    this.repositories.clear();
    this.issues.clear();
    this.installations.clear();
    this.webhookEvents = [];
    this.outgoingWebhookResponses = [];
    this.nextCommentId = 1000;
    this.initializeDefaultData();
  }
}

const dataStore = new MockGitHubDataStore();

// Webhook secret for signature verification
const WEBHOOK_SECRET =
  process.env.MOCK_GITHUB_WEBHOOK_SECRET || "test-webhook-secret";

// Generate webhook signature
function generateWebhookSignature(payload: string): string {
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

// Parse URL path and extract params
function parseRoute(
  url: string,
  pattern: RegExp,
): Record<string, string> | null {
  const match = url.match(pattern);
  if (!match) return null;
  return match.groups || {};
}

// JSON response helper
function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Parse request body
async function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Request handlers
const handlers: Array<{
  method: string;
  pattern: RegExp;
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    params: Record<string, string>,
    body?: unknown,
  ) => Promise<void> | void;
}> = [
  // GitHub App root endpoint
  {
    method: "GET",
    pattern: /^\/app$/,
    handler: (_req, res) => {
      jsonResponse(res, {
        id: 123456,
        slug: "openhands-test-app",
        name: "OpenHands Test App",
        owner: { login: "test-owner", id: 1000 },
        permissions: {
          issues: "write",
          pull_requests: "write",
          contents: "write",
        },
      });
    },
  },

  // Get repository
  {
    method: "GET",
    pattern: /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
    handler: (_req, res, params) => {
      const fullName = `${params.owner}/${params.repo}`;
      const repo = dataStore.getRepository(fullName);
      if (repo) {
        jsonResponse(res, repo);
      } else {
        jsonResponse(res, { message: "Not Found" }, 404);
      }
    },
  },

  // Get issue
  {
    method: "GET",
    pattern:
      /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/issues\/(?<number>\d+)$/,
    handler: (_req, res, params) => {
      const fullName = `${params.owner}/${params.repo}`;
      const issue = dataStore.getIssue(fullName, parseInt(params.number, 10));
      if (issue) {
        const repo = dataStore.getRepository(fullName);
        jsonResponse(res, {
          ...issue,
          url: `https://api.github.com/repos/${fullName}/issues/${issue.number}`,
          html_url: `https://github.com/${fullName}/issues/${issue.number}`,
          repository: repo,
        });
      } else {
        jsonResponse(res, { message: "Not Found" }, 404);
      }
    },
  },

  // List issues
  {
    method: "GET",
    pattern: /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/issues$/,
    handler: (_req, res, params) => {
      const fullName = `${params.owner}/${params.repo}`;
      const issues = dataStore.getIssues(fullName);
      jsonResponse(res, issues);
    },
  },

  // Get issue comments
  {
    method: "GET",
    pattern:
      /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/issues\/(?<number>\d+)\/comments$/,
    handler: (_req, res, params) => {
      const fullName = `${params.owner}/${params.repo}`;
      const issue = dataStore.getIssue(fullName, parseInt(params.number, 10));
      if (issue) {
        jsonResponse(res, issue.comments);
      } else {
        jsonResponse(res, { message: "Not Found" }, 404);
      }
    },
  },

  // Create issue comment
  {
    method: "POST",
    pattern:
      /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/issues\/(?<number>\d+)\/comments$/,
    handler: async (_req, res, params, body) => {
      const fullName = `${params.owner}/${params.repo}`;
      const issueNumber = parseInt(params.number, 10);
      const requestBody = body as { body: string };

      try {
        const comment = dataStore.addComment(
          fullName,
          issueNumber,
          requestBody.body,
          {
            login: "openhands[bot]",
            id: 99999,
          },
        );

        // Record this as an outgoing response (the resolver posting back)
        dataStore.recordOutgoingWebhookResponse(requestBody.body);

        jsonResponse(res, comment, 201);
      } catch {
        jsonResponse(res, { message: "Not Found" }, 404);
      }
    },
  },

  // Create issue reaction
  {
    method: "POST",
    pattern:
      /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/issues\/(?<number>\d+)\/reactions$/,
    handler: async (_req, res, params, body) => {
      const fullName = `${params.owner}/${params.repo}`;
      const issueNumber = parseInt(params.number, 10);
      const requestBody = body as { content: string };

      dataStore.addReaction(fullName, issueNumber, requestBody.content);
      jsonResponse(res, { id: Date.now(), content: requestBody.content }, 201);
    },
  },

  // Add issue label
  {
    method: "POST",
    pattern:
      /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/issues\/(?<number>\d+)\/labels$/,
    handler: async (_req, res, params, body) => {
      const fullName = `${params.owner}/${params.repo}`;
      const issueNumber = parseInt(params.number, 10);
      const requestBody = body as { labels: string[] };

      const issue = dataStore.getIssue(fullName, issueNumber);
      if (issue) {
        requestBody.labels.forEach((label) =>
          dataStore.addLabel(fullName, issueNumber, label),
        );
        jsonResponse(res, issue.labels, 201);
      } else {
        jsonResponse(res, { message: "Not Found" }, 404);
      }
    },
  },

  // Get installation access token
  {
    method: "POST",
    pattern: /^\/app\/installations\/(?<installation_id>\d+)\/access_tokens$/,
    handler: (_req, res, params) => {
      const installation = dataStore.getInstallation(
        parseInt(params.installation_id, 10),
      );
      if (installation) {
        jsonResponse(
          res,
          {
            token: installation.access_token,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            permissions: {
              issues: "write",
              pull_requests: "write",
              contents: "write",
            },
            repository_selection: "all",
          },
          201,
        );
      } else {
        jsonResponse(res, { message: "Not Found" }, 404);
      }
    },
  },

  // Get installation repositories
  {
    method: "GET",
    pattern: /^\/installation\/repositories$/,
    handler: (_req, res) => {
      // Return all repositories from all installations
      const repos = dataStore.getAllRepositories();
      jsonResponse(res, {
        total_count: repos.length,
        repositories: repos,
      });
    },
  },

  // Get user
  {
    method: "GET",
    pattern: /^\/user$/,
    handler: (_req, res) => {
      jsonResponse(res, {
        id: 2000,
        login: "test-user",
        avatar_url: "https://avatars.githubusercontent.com/u/2000",
        name: "Test User",
        email: "test-user@example.com",
      });
    },
  },

  // Get user by username
  {
    method: "GET",
    pattern: /^\/users\/(?<username>[^/]+)$/,
    handler: (_req, res, params) => {
      jsonResponse(res, {
        id: 2000,
        login: params.username,
        avatar_url: `https://avatars.githubusercontent.com/u/2000`,
        name: params.username,
      });
    },
  },

  // Get repository collaborator permission
  {
    method: "GET",
    pattern:
      /^\/repos\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/collaborators\/(?<username>[^/]+)\/permission$/,
    handler: (_req, res) => {
      jsonResponse(res, {
        permission: "write",
        user: { login: "test-user", id: 2000 },
      });
    },
  },

  // GraphQL endpoint
  {
    method: "POST",
    pattern: /^\/graphql$/,
    handler: async (_req, res, _params, _body) => {
      // Return a basic response for common queries
      // The body would contain { query: string, variables?: Record<string, unknown> }
      jsonResponse(res, {
        data: {
          repository: {
            id: "R_kgDOTest123",
            name: "test-repo",
            owner: { login: "test-owner" },
          },
        },
      });
    },
  },

  // Test control endpoints - Get webhook events
  {
    method: "GET",
    pattern: /^\/_test\/webhook-events$/,
    handler: (_req, res) => {
      jsonResponse(res, dataStore.getWebhookEvents());
    },
  },

  // Test control endpoints - Get outgoing webhook responses
  {
    method: "GET",
    pattern: /^\/_test\/outgoing-responses$/,
    handler: (_req, res) => {
      jsonResponse(res, dataStore.getOutgoingWebhookResponses());
    },
  },

  // Test control endpoints - Clear events
  {
    method: "POST",
    pattern: /^\/_test\/clear-events$/,
    handler: (_req, res) => {
      dataStore.clearEvents();
      jsonResponse(res, { status: "cleared" });
    },
  },

  // Test control endpoints - Reset data
  {
    method: "POST",
    pattern: /^\/_test\/reset$/,
    handler: (_req, res) => {
      dataStore.reset();
      jsonResponse(res, { status: "reset" });
    },
  },

  // Test control endpoints - Trigger webhook
  {
    method: "POST",
    pattern: /^\/_test\/trigger-webhook$/,
    handler: async (req, res, _params, body) => {
      const { targetUrl, eventType, payload } = body as {
        targetUrl: string;
        eventType: string;
        payload: Record<string, unknown>;
      };

      // Record the webhook event
      dataStore.recordWebhookEvent(eventType, payload);

      // Send the webhook to the target URL
      const payloadString = JSON.stringify(payload);
      const signature = generateWebhookSignature(payloadString);

      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GitHub-Event": eventType,
            "X-Hub-Signature-256": signature,
            "X-GitHub-Delivery": crypto.randomUUID(),
          },
          body: payloadString,
        });

        const responseText = await response.text();
        jsonResponse(res, {
          status: "sent",
          targetUrl,
          eventType,
          responseStatus: response.status,
          responseBody: responseText,
        });
      } catch (error) {
        jsonResponse(
          res,
          {
            status: "error",
            error: (error as Error).message,
          },
          500,
        );
      }
    },
  },

  // Health check
  {
    method: "GET",
    pattern: /^\/_health$/,
    handler: (_req, res) => {
      jsonResponse(res, { status: "healthy" });
    },
  },
];

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  // Add CORS headers to all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  // Parse body for POST/PUT requests
  let body: unknown;
  if (method === "POST" || method === "PUT") {
    const rawBody = await parseBody(req);
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }

  // Try to match a handler
  for (const handler of handlers) {
    if (handler.method === method) {
      const params = parseRoute(url.split("?")[0], handler.pattern);
      if (params !== null) {
        try {
          await handler.handler(req, res, params, body);
          return;
        } catch (error) {
          console.error(`Error handling ${method} ${url}:`, error);
          jsonResponse(res, { error: "Internal Server Error" }, 500);
          return;
        }
      }
    }
  }

  // No handler found
  console.log(`No handler for ${method} ${url}`);
  jsonResponse(res, { message: "Not Found", path: url }, 404);
});

// Start server
const PORT = parseInt(process.env.MOCK_GITHUB_PORT || "9999", 10);

server.listen(PORT, () => {
  console.log(`Mock GitHub Server running on port ${PORT}`);
  console.log(`Webhook secret: ${WEBHOOK_SECRET}`);
  console.log("\nAvailable endpoints:");
  console.log("  GET  /_health                    - Health check");
  console.log(
    "  GET  /_test/webhook-events       - Get recorded webhook events",
  );
  console.log(
    "  GET  /_test/outgoing-responses   - Get responses posted by the resolver",
  );
  console.log("  POST /_test/clear-events         - Clear recorded events");
  console.log("  POST /_test/reset                - Reset all mock data");
  console.log(
    "  POST /_test/trigger-webhook      - Trigger a webhook to target URL",
  );
  console.log("\nGitHub API endpoints:");
  console.log("  GET  /repos/:owner/:repo");
  console.log("  GET  /repos/:owner/:repo/issues/:number");
  console.log("  POST /repos/:owner/:repo/issues/:number/comments");
  console.log("  POST /repos/:owner/:repo/issues/:number/reactions");
  console.log("  POST /app/installations/:id/access_tokens");
  console.log("  POST /graphql");
});

export { server, dataStore, generateWebhookSignature, WEBHOOK_SECRET };
