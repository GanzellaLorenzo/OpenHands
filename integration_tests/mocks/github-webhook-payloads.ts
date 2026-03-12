/**
 * GitHub Webhook Payload Templates
 *
 * These templates mirror the webhook payloads that GitHub sends for various events.
 * They're used to test the OpenHands resolver integration.
 */

export interface GitHubWebhookPayload {
  action: string;
  installation: { id: number };
  repository: {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    owner: { login: string; id: number };
    default_branch: string;
  };
  sender: { login: string; id: number };
  [key: string]: unknown;
}

export interface IssuePayload extends GitHubWebhookPayload {
  issue: {
    number: number;
    title: string;
    body: string;
    state: string;
    labels: Array<{ name: string; id: number }>;
    user: { login: string; id: number };
  };
  label?: { name: string; id: number };
}

export interface IssueCommentPayload extends GitHubWebhookPayload {
  issue: {
    number: number;
    title: string;
    body: string;
    state: string;
    labels: Array<{ name: string; id: number }>;
    user: { login: string; id: number };
    pull_request?: { url: string };
  };
  comment: {
    id: number;
    body: string;
    user: { login: string; id: number };
  };
}

export interface PullRequestReviewCommentPayload extends GitHubWebhookPayload {
  pull_request: {
    number: number;
    title: string;
    body: string;
    state: string;
    head: { ref: string; sha: string };
    base: { ref: string };
    user: { login: string; id: number };
  };
  comment: {
    id: number;
    node_id: string;
    body: string;
    path: string;
    line: number;
    user: { login: string; id: number };
  };
}

/**
 * Create a base webhook payload with common fields
 */
function createBasePayload(params: {
  installationId?: number;
  repositoryId?: number;
  repositoryName?: string;
  repositoryOwner?: string;
  senderLogin?: string;
  senderId?: number;
  isPrivate?: boolean;
}): GitHubWebhookPayload {
  const {
    installationId = 12345,
    repositoryId = 123456789,
    repositoryName = "test-repo",
    repositoryOwner = "test-owner",
    senderLogin = "test-user",
    senderId = 2000,
    isPrivate = false,
  } = params;

  return {
    action: "",
    installation: { id: installationId },
    repository: {
      id: repositoryId,
      name: repositoryName,
      full_name: `${repositoryOwner}/${repositoryName}`,
      private: isPrivate,
      owner: { login: repositoryOwner, id: 1000 },
      default_branch: "main",
    },
    sender: { login: senderLogin, id: senderId },
  };
}

/**
 * Create a payload for an issue being labeled with the OpenHands label
 */
export function createIssueLabeledPayload(params: {
  installationId?: number;
  issueNumber?: number;
  issueTitle?: string;
  issueBody?: string;
  labelName?: string;
  repositoryName?: string;
  repositoryOwner?: string;
  senderLogin?: string;
  senderId?: number;
}): IssuePayload {
  const {
    issueNumber = 1,
    issueTitle = "Test Issue for OpenHands Resolver",
    issueBody = "This is a test issue. Please add a README file.",
    labelName = "openhands",
    senderLogin = "test-user",
    senderId = 2000,
    ...rest
  } = params;

  const base = createBasePayload({ senderLogin, senderId, ...rest });
  const label = { name: labelName, id: Date.now() };

  return {
    ...base,
    action: "labeled",
    issue: {
      number: issueNumber,
      title: issueTitle,
      body: issueBody,
      state: "open",
      labels: [label],
      user: { login: senderLogin, id: senderId },
    },
    label,
  };
}

/**
 * Create a payload for an issue comment mentioning @openhands
 */
export function createIssueCommentPayload(params: {
  installationId?: number;
  issueNumber?: number;
  issueTitle?: string;
  issueBody?: string;
  commentBody?: string;
  commentId?: number;
  repositoryName?: string;
  repositoryOwner?: string;
  senderLogin?: string;
  senderId?: number;
  isPullRequest?: boolean;
}): IssueCommentPayload {
  const {
    issueNumber = 1,
    issueTitle = "Test Issue for OpenHands Resolver",
    issueBody = "This is a test issue.",
    commentBody = "@openhands please add a README file",
    commentId = 1001,
    senderLogin = "test-user",
    senderId = 2000,
    isPullRequest = false,
    ...rest
  } = params;

  const base = createBasePayload({ senderLogin, senderId, ...rest });

  const payload: IssueCommentPayload = {
    ...base,
    action: "created",
    issue: {
      number: issueNumber,
      title: issueTitle,
      body: issueBody,
      state: "open",
      labels: [],
      user: { login: "issue-creator", id: 3000 },
    },
    comment: {
      id: commentId,
      body: commentBody,
      user: { login: senderLogin, id: senderId },
    },
  };

  if (isPullRequest) {
    payload.issue.pull_request = {
      url: `https://api.github.com/repos/${base.repository.full_name}/pulls/${issueNumber}`,
    };
  }

  return payload;
}

/**
 * Create a payload for a PR review comment mentioning @openhands
 */
export function createPullRequestReviewCommentPayload(params: {
  installationId?: number;
  prNumber?: number;
  prTitle?: string;
  prBody?: string;
  commentBody?: string;
  commentId?: number;
  filePath?: string;
  lineNumber?: number;
  headBranch?: string;
  baseBranch?: string;
  repositoryName?: string;
  repositoryOwner?: string;
  senderLogin?: string;
  senderId?: number;
}): PullRequestReviewCommentPayload {
  const {
    prNumber = 2,
    prTitle = "Test PR for OpenHands Resolver",
    prBody = "This is a test PR.",
    commentBody = "@openhands please fix this code",
    commentId = 2001,
    filePath = "src/main.ts",
    lineNumber = 10,
    headBranch = "feature-branch",
    baseBranch = "main",
    senderLogin = "test-user",
    senderId = 2000,
    ...rest
  } = params;

  const base = createBasePayload({ senderLogin, senderId, ...rest });

  return {
    ...base,
    action: "created",
    pull_request: {
      number: prNumber,
      title: prTitle,
      body: prBody,
      state: "open",
      head: { ref: headBranch, sha: "abc123def456" },
      base: { ref: baseBranch },
      user: { login: "pr-creator", id: 4000 },
    },
    comment: {
      id: commentId,
      node_id: `PRRC_${commentId}`,
      body: commentBody,
      path: filePath,
      line: lineNumber,
      user: { login: senderLogin, id: senderId },
    },
  };
}

/**
 * Get the GitHub event type for a payload
 */
export function getEventType(payload: GitHubWebhookPayload): string {
  if ("comment" in payload && "pull_request" in payload) {
    return "pull_request_review_comment";
  }
  if ("comment" in payload) {
    return "issue_comment";
  }
  if ("issue" in payload) {
    return "issues";
  }
  return "unknown";
}
