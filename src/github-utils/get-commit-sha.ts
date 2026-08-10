import * as core from "@actions/core";
import * as github from "@actions/github";

import { hasEventPayload } from "./has-event-payload.ts";

export function getCommitSha(): string {
  if (hasEventPayload(github.context, "pull_request")) {
    return github.context.payload.pull_request.head.sha;
  }

  if (hasEventPayload(github.context, "workflow_run")) {
    return github.context.payload.workflow_run.head_sha;
  }

  // Surface the fallback: the context sha may not be the commit the check
  // should be attached to (e.g. a base-branch sha).
  core.warning(
    `Unable to find a head sha for a "${github.context.eventName}" event, using the context sha`,
  );

  return github.context.sha;
}
