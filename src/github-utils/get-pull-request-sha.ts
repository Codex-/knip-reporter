import * as github from "@actions/github";

import { isEventType } from "./is-event-type.ts";

export function getPullRequestSha(): string {
  if (isEventType(github.context, "pull_request")) {
    return github.context.payload.pull_request.head.sha;
  }

  if (isEventType(github.context, "workflow_run")) {
    if (github.context.payload.workflow_run.pull_requests.length > 0) {
      const [pullRequest] = github.context.payload.workflow_run.pull_requests;

      if (!pullRequest) {
        throw new Error("No pull request found in GitHub event payload");
      }

      return pullRequest.head.sha;
    }

    return github.context.payload.workflow_run.head_sha;
  }

  return github.context.sha;
}
