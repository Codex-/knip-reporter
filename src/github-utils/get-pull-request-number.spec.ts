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
    delete github.context.payload.pull_request;
    delete github.context.payload.workflow_run;
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

  it("returns the pull request number for pull_request_target events", async () => {
    github.context.eventName = "pull_request_target";
    github.context.payload.pull_request = { number: 43 };

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toStrictEqual(43);

    // Logging
    assertNoneCalled();
  });

  it("returns pull request number from workflow_run payload when available", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [{ number: 100, head: { sha: "abc123" } }],
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

  it("picks the workflow_run payload entry whose head sha matches the run", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [
        { number: 7, head: { sha: "other-sha" } },
        { number: 8, head: { sha: "abc123" } },
      ],
      head_sha: "abc123",
    };

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toStrictEqual(8);

    // Logging
    assertOnlyCalled(coreInfoLogMock);
    expect(coreInfoLogMock).toHaveBeenCalledOnce();
  });

  it("queries the API when no workflow_run payload entry matches the head sha", async () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = {
      pull_requests: [{ number: 100, head: { sha: "stale-sha" } }],
      head_sha: "abc123",
    };

    const findPullRequestNumberSpy = vi
      .spyOn(api, "findPullRequestNumberForCommitSha")
      .mockResolvedValue(555);

    // Behaviour
    const pullRequestNumber = await getPullRequestNumber();
    expect(pullRequestNumber).toStrictEqual(555);
    expect(findPullRequestNumberSpy).toHaveBeenCalledOnce();
    expect(findPullRequestNumberSpy).toHaveBeenCalledWith("abc123");

    // Logging
    assertOnlyCalled(coreInfoLogMock);
    expect(coreInfoLogMock).toHaveBeenCalledOnce();
    expect(coreInfoLogMock.mock.lastCall?.[0]).toContain(
      "Trying to find a pull-request with a head commit matching the SHA",
    );
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
