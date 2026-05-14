import * as core from "@actions/core";
import * as github from "@actions/github";

import { isEventType } from "./is-event-type.ts";
import { findPullRequestNumberForCommitSha } from "../api.ts";

export async function getPullRequestNumber(): Promise<number | undefined> {
  if (isEventType(github.context, "pull_request")) {
    return github.context.payload.pull_request.number;
  }

  if (isEventType(github.context, "workflow_run")) {
    // Workflow_runs triggered from non-forked PRs will have the PR number in the payload
    if (github.context.payload.workflow_run.pull_requests.length > 0) {
      core.info(
        `Found pull-request number in the action's "payload.workflow_run" context: ${github.context.payload.workflow_run.pull_requests[0]?.number.toString()}`,
      );

      const [pullRequest] = github.context.payload.workflow_run.pull_requests;

      if (!pullRequest) {
        throw new Error("No pull request found in GitHub event payload");
      }

      return pullRequest.number;
    }

    const sha = github.context.payload.workflow_run.head_sha;

    // ... in all other cases, we have to call the API to get a matching PR number
    core.info(
      `Trying to find a pull-request with a head commit matching the SHA found in the action's "payload.workflow_run.head_sha" context (${sha}) from the GitHub API.`,
    );

    try {
      return await findPullRequestNumberForCommitSha(github.context.payload.workflow_run.head_sha);
    } catch (error) {
      core.warning(
        `An error occurred while fetching pull requests from the GitHub API: ${(error as Error).message}`,
      );

      return undefined;
    }
  }

  return undefined;
}
