import * as github from "@actions/github";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { isEventType } from "./is-event-type.ts";

vi.mock("@actions/github");

describe("isEventType", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the event type matches context.eventName", () => {
    github.context.eventName = "pull_request";

    // Behaviour
    expect(isEventType(github.context, "pull_request")).toStrictEqual(true);
  });

  it("returns false when the event type does not match context.eventName", () => {
    github.context.eventName = "workflow_run";

    // Behaviour
    expect(isEventType(github.context, "pull_request")).toStrictEqual(false);
  });
});
