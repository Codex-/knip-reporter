import * as github from "@actions/github";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api.ts";
import { getPullRequestNumber } from "./get-pull-request-number.ts";
import { mockLoggingFunctions } from "../test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("../api.ts");

describe("getPullRequestNumber", () => {
  const { coreInfoLogMock, coreWarningLogMock, assertOnlyCalled, assertNoneCalled } =
    mockLoggingFunctions();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    github.context.eventName = "pull_request";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the pull request number for pull_request events", async () => {
    github.context.payload.pull_request = { number: 42 };

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toStrictEqual(42);

    // Logging
    assertNoneCalled();
  });

  it("returns pull request number from workflow_run payload when available", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [{ number: 100 }],
      head_sha: "abc123",
    };

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toStrictEqual(100);

    // Logging
    assertOnlyCalled(coreInfoLogMock);
    expect(coreInfoLogMock).toHaveBeenCalledOnce();
    expect(coreInfoLogMock.mock.lastCall?.[0]).toContain(
      'Found pull-request number in the action\'s "payload.workflow_run" context',
    );
  });

  it("throws when a pull request is empty in a workflow_run payload", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [undefined],
      head_sha: "abc123",
    };

    // Behaviour
    await expect(getPullRequestNumber()).rejects.toThrow(
      "No pull request found in GitHub event payload",
    );

    // Logging
    assertOnlyCalled(coreInfoLogMock);
  });

  it("queries the API when workflow_run has no pull request entries", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [],
      head_sha: "def456",
    };

    const findPullRequestNumberSpy = vi
      .spyOn(api, "findPullRequestNumberForCommitSha")
      .mockResolvedValue(555);

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toStrictEqual(555);
    expect(findPullRequestNumberSpy).toHaveBeenCalledOnce();
    expect(findPullRequestNumberSpy).toHaveBeenCalledWith("def456");

    // Logging
    assertOnlyCalled(coreInfoLogMock);
    expect(coreInfoLogMock).toHaveBeenCalledOnce();
    expect(coreInfoLogMock.mock.lastCall?.[0]).toContain(
      "Trying to find a pull-request with a head commit matching the SHA",
    );
  });

  it("returns undefined and logs a warning if API lookup fails", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [],
      head_sha: "ghi789",
    };

    vi.spyOn(api, "findPullRequestNumberForCommitSha").mockRejectedValue(new Error("boom"));

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toBeUndefined();

    // Logging
    assertOnlyCalled(coreInfoLogMock, coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledOnce();
    expect(coreWarningLogMock.mock.lastCall?.[0]).toContain(
      "An error occurred while fetching pull requests from the GitHub API: boom",
    );
  });

  it("returns undefined for unsupported event types", async () => {
    github.context.eventName = "push";

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toBeUndefined();

    // Logging
    assertNoneCalled();
  });
});
