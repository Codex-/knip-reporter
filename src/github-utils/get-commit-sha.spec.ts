import * as github from "@actions/github";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCommitSha } from "./get-commit-sha.ts";

vi.mock("@actions/github");

describe("getCommitSha", () => {
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
    const sha = getCommitSha();
    expect(sha).toStrictEqual("pull-request-sha");
  });

  it("returns the `head_sha` when the event type is `workflow_run`", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      head_sha: "workflow-pr-sha",
    };

    // Behaviour
    const sha = getCommitSha();
    expect(sha).toStrictEqual("workflow-pr-sha");
  });

  it("returns the `head_sha` for workflow_run even when `head_commit` is null", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      head_sha: "workflow-pr-sha",
      head_commit: null,
    };

    // Behaviour
    const sha = getCommitSha();
    expect(sha).toStrictEqual("workflow-pr-sha");
  });

  it("falls back to context sha for unspecified event types", () => {
    github.context.eventName = "push";

    // Behaviour
    const sha = getCommitSha();
    expect(sha).toStrictEqual("context-sha");
  });
});
