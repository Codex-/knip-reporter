import * as github from "@actions/github";

import { isEventType } from "./is-event-type.ts";

export function getCommitSha(): string {
  if (isEventType(github.context, "pull_request")) {
    return github.context.payload.pull_request.head.sha;
  }

  if (isEventType(github.context, "workflow_run")) {
    return github.context.payload.workflow_run.head_sha;
  }

  return github.context.sha;
}
