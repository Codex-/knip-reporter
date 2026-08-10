import * as github from "@actions/github";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasEventPayload } from "./has-event-payload.ts";

vi.mock("@actions/github");

describe("hasEventPayload", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    delete github.context.payload.pull_request;
    delete github.context.payload.workflow_run;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns `true` when the payload carries the event object", () => {
    github.context.eventName = "pull_request";
    github.context.payload.pull_request = { number: 1 };

    // Behaviour
    expect(hasEventPayload(github.context, "pull_request")).toStrictEqual(true);
  });

  it("returns `true` when the payload carries the event object under a different event name", () => {
    github.context.eventName = "pull_request_target";
    github.context.payload.pull_request = { number: 1 };

    // Behaviour
    expect(hasEventPayload(github.context, "pull_request")).toStrictEqual(true);
  });

  it("returns `false` when the payload does not carry the requested event object", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = { head_sha: "abc123" };

    // Behaviour
    expect(hasEventPayload(github.context, "pull_request")).toStrictEqual(false);
  });

  it("returns `false` when the event name matches but the payload object is missing", () => {
    github.context.eventName = "pull_request";

    // Behaviour
    expect(hasEventPayload(github.context, "pull_request")).toStrictEqual(false);
  });
});
