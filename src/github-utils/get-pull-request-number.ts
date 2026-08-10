import * as core from "@actions/core";
import * as github from "@actions/github";

import { hasEventPayload } from "./has-event-payload.ts";
import { findPullRequestNumberForCommitSha } from "../api.ts";

export async function getPullRequestNumber(): Promise<number | undefined> {
  if (hasEventPayload(github.context, "pull_request")) {
    return github.context.payload.pull_request.number;
  }

  if (hasEventPayload(github.context, "workflow_run")) {
    const { pull_requests: pullRequests, head_sha: sha } = github.context.payload.workflow_run;

    // `workflow_run`s triggered from non-forked PRs will have the PR number in the payload.
    // The array can also list stale entries and PRs that merely target the run's
    // branch, so only trust an entry whose head sha matches the run's head sha.
    const pullRequest = pullRequests.find((pr) => pr.head.sha === sha);
    if (pullRequest) {
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
      const detail = error instanceof Error ? error.message : String(error);
      core.warning(`An error occurred while fetching pull requests from the GitHub API: ${detail}`);

      return undefined;
    }
  }

  return undefined;
}
