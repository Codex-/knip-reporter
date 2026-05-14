import * as github from "@actions/github";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPullRequestSha } from "./get-pull-request-sha.ts";

vi.mock("@actions/github");

describe("getPullRequestSha", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    github.context.eventName = "pull_request";
    github.context.sha = "context-sha";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns pull request head sha for pull_request events", () => {
    github.context.payload.pull_request = {
      number: 42,
      head: { sha: "pull-request-sha" },
    };

    // Behaviour
    const sha = getPullRequestSha();
    expect(sha).toStrictEqual("pull-request-sha");
  });

  it("returns first workflow_run pull request sha when the event type is workflow_run", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [{ head: { sha: "workflow-pr-sha" } }],
      head_sha: "workflow-head-sha",
    };

    // Behaviour
    const sha = getPullRequestSha();
    expect(sha).toStrictEqual("workflow-pr-sha");
  });

  it("throws when workflow_run pull request entry is missing", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [undefined],
      head_sha: "workflow-head-sha",
    };

    // Behaviour
    expect(() => getPullRequestSha()).toThrow("No pull request found in GitHub event payload");
  });

  it("returns workflow_run head_sha when no pull request entries are present", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [],
      head_sha: "workflow-head-sha",
    };

    // Behaviour
    const sha = getPullRequestSha();
    expect(sha).toStrictEqual("workflow-head-sha");
  });

  it("falls back to context sha for unsupported event types", () => {
    github.context.eventName = "push";

    // Behaviour
    const sha = getPullRequestSha();
    expect(sha).toStrictEqual("context-sha");
  });
});
