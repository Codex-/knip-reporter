import * as core from "@actions/core";
import * as github from "@actions/github";

import { isEventType } from "./is-event-type.ts";
import { findPullRequestNumberForCommitSha } from "../api.ts";

export async function getPullRequestNumber(): Promise<number | undefined> {
  if (isEventType(github.context, "pull_request")) {
    return github.context.payload.pull_request.number;
  }

  if (isEventType(github.context, "workflow_run")) {
    const { pull_requests: pullRequests, head_sha: sha } = github.context.payload.workflow_run;

    // `workflow_run`s triggered from non-forked PRs will have the PR number in the payload
    if (pullRequests.length > 0) {
      const [pullRequest] = pullRequests;

      if (!pullRequest) {
        throw new Error("No pull request found in GitHub event payload");
      }

      core.info(
        `Found pull-request number in the action's "payload.workflow_run" context: ${pullRequest.number}`,
      );

      return pullRequest.number;
    }

    // ... in all other cases, we have to call the API to get a matching PR number
    core.info(
      `Trying to find a pull-request with a head commit matching the SHA found in the action's "payload.workflow_run.head_sha" context (${sha}) from the GitHub API.`,
    );

    try {
      return await findPullRequestNumberForCommitSha(sha);
    } catch (error) {
      core.warning(
        `An error occurred while fetching pull requests from the GitHub API: ${(error as Error).message}`,
      );

      return undefined;
    }
  }

  return undefined;
}
