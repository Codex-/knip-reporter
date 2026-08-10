import * as github from "@actions/github";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCommitSha } from "./get-commit-sha.ts";
import { mockLoggingFunctions } from "../test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("@actions/github");

describe("getCommitSha", () => {
  const { coreWarningLogMock, assertOnlyCalled, assertNoneCalled } = mockLoggingFunctions();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    github.context.eventName = "pull_request";
    github.context.sha = "context-sha";
    delete github.context.payload.pull_request;
    delete github.context.payload.workflow_run;
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

    // Logging
    assertNoneCalled();
  });

  it("returns pull request head sha for pull_request_target events", () => {
    github.context.eventName = "pull_request_target";
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

  it("falls back to context sha for unspecified event types, with a warning", () => {
    github.context.eventName = "push";

    // Behaviour
    const sha = getCommitSha();
    expect(sha).toStrictEqual("context-sha");

    // Logging
    assertOnlyCalled(coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledOnce();
    expect(coreWarningLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
      `"Unable to find a head sha for a "push" event, using the context sha"`,
    );
  });
});
