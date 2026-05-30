import * as github from "@actions/github";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isEventType } from "./is-event-type.ts";

vi.mock("@actions/github");

describe("isEventType", () => {
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

  it("returns `true` when the event name matches and the payload carries the event object", () => {
    github.context.eventName = "pull_request";
    github.context.payload.pull_request = { number: 1 };

    // Behaviour
    expect(isEventType(github.context, "pull_request")).toStrictEqual(true);
  });

  it("returns `false` when the event type does not match `context.eventName`", () => {
    github.context.eventName = "workflow_run";
    github.context.payload.workflow_run = { head_sha: "abc123" };

    // Behaviour
    expect(isEventType(github.context, "pull_request")).toStrictEqual(false);
  });

  it("returns `false` when the event name matches but the payload object is missing", () => {
    github.context.eventName = "pull_request";

    // Behaviour
    expect(isEventType(github.context, "pull_request")).toStrictEqual(false);
  });
});
