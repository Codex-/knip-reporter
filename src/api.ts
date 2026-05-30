import * as core from "@actions/core";
import * as github from "@actions/github";

import { type ActionConfig, getConfig } from "./action.ts";
import { getCommitSha } from "./github-utils/get-commit-sha.ts";

export const GITHUB_COMMENT_MAX_COMMENT_LENGTH = 65535;

type Octokit = ReturnType<(typeof github)["getOctokit"]>;

let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  const resolved = cfg ?? getConfig();
  octokit = github.getOctokit(resolved.token);
}

type CreateCommentResponse = Awaited<ReturnType<Octokit["rest"]["issues"]["createComment"]>>;
export async function createComment(
  pullRequestNumber: number,
  body: string,
): Promise<CreateCommentResponse> {
  core.debug(`[createComment]: Creating comment on #${pullRequestNumber}`);

  // https://docs.github.com/en/rest/issues/comments#create-an-issue-comment
  try {
    return await octokit.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: pullRequestNumber,
      body: body,
    });
  } catch (error) {
    throw new Error("Failed to create comment", { cause: error });
  }
}

export async function listCommentIds(
  cfgCommentId: string,
  pullRequestNumber: number,
): Promise<number[] | undefined> {
  // https://docs.github.com/en/rest/issues/comments#list-issue-comments
  const params: Parameters<Octokit["rest"]["issues"]["listComments"]>[0] = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: pullRequestNumber,
    per_page: 100,
  };
  const restIter = octokit.paginate.iterator(octokit.rest.issues.listComments, params);

  const messageIds: number[] = [];
  try {
    for await (const { data } of restIter) {
      for (const { id, body } of data) {
        if (!body) {
          continue;
        }

        if (body.includes(cfgCommentId)) {
          messageIds.push(id);
        }
      }
    }
  } catch (error) {
    throw new Error("Failed to find comment IDs", { cause: error });
  }

  if (messageIds.length > 0) {
    core.debug(`[getCommentIds]: Existing IDs found: [${messageIds.join(", ")}]`);
    return messageIds;
  }

  core.debug("[getCommentIds]: No existing IDs found");
  return undefined;
}

type UpdateCommentResponse = Awaited<ReturnType<Octokit["rest"]["issues"]["updateComment"]>>;
export async function updateComment(
  commentId: number,
  body: string,
): Promise<UpdateCommentResponse> {
  // https://docs.github.com/en/rest/issues/comments#update-an-issue-comment
  try {
    return await octokit.rest.issues.updateComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      comment_id: commentId,
      body: body,
    });
  } catch (error) {
    throw new Error("Failed to update comment", { cause: error });
  }
}

type DeleteCommentResponse = Awaited<ReturnType<Octokit["rest"]["issues"]["deleteComment"]>>;
export async function deleteComment(commentId: number): Promise<DeleteCommentResponse> {
  // https://docs.github.com/en/rest/issues/comments#delete-an-issue-comment
  try {
    return await octokit.rest.issues.deleteComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      comment_id: commentId,
    });
  } catch (error) {
    throw new Error("Failed to delete comment", { cause: error });
  }
}

type CreateCheckResponse = Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>;
export async function createCheck(name: string, title: string): Promise<CreateCheckResponse> {
  const headSha = getCommitSha();

  // https://docs.github.com/en/rest/checks/runs#create-a-check-run
  try {
    return await octokit.rest.checks.create({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      name: name,
      head_sha: headSha,
      status: "in_progress",
      output: {
        title: title,
        summary: "",
      },
    });
  } catch (error) {
    throw new Error("Failed to create check", { cause: error });
  }
}

type CheckStatus = NonNullable<Parameters<Octokit["rest"]["checks"]["create"]>[0]>["status"];
export type CheckConclusion = NonNullable<
  Parameters<Octokit["rest"]["checks"]["create"]>[0]
>["conclusion"];
export type CheckOutput = NonNullable<Parameters<Octokit["rest"]["checks"]["create"]>[0]>["output"];
type UpdateCheckResponse = Awaited<ReturnType<Octokit["rest"]["checks"]["update"]>>;
export async function updateCheck(
  checkRunId: number,
  status: CheckStatus,
  output?: CheckOutput,
  conclusion?: CheckConclusion,
): Promise<UpdateCheckResponse> {
  // https://docs.github.com/en/rest/checks/runs#update-a-check-run
  try {
    return await octokit.rest.checks.update({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      check_run_id: checkRunId,
      status: status,
      conclusion: conclusion,
      output: output,
    });
  } catch (error) {
    throw new Error("Failed to update check", { cause: error });
  }
}

export async function findPullRequestNumberForCommitSha(sha: string): Promise<number | undefined> {
  core.startGroup("Querying REST API for pull-requests.");

  // `pulls.list` defaults to state:"open", so a workflow_run that completed
  // after its pull request was merged or closed would never match the head
  // SHA and the action would fail to find the PR.
  // `listPullRequestsAssociatedWithCommit` gives us all of them irrespective
  // of status.
  try {
    const pullRequestsIterator = octokit.paginate.iterator(
      octokit.rest.repos.listPullRequestsAssociatedWithCommit,
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        commit_sha: sha,
        per_page: 30,
      },
    );

    for await (const { data: pullRequests } of pullRequestsIterator) {
      core.info(`Found ${pullRequests.length} pull-requests for this commit.`);

      for (const pullRequest of pullRequests) {
        core.debug(
          `Comparing: ${pullRequest.number} sha: ${pullRequest.head.sha} with expected: ${sha}.`,
        );

        if (pullRequest.head.sha === sha) {
          return pullRequest.number;
        }
      }
    }
  } finally {
    // Always close the log group, even on an early return or a thrown
    // pagination error, so subsequent logs are not nested under it.
    core.endGroup();
  }

  core.info(`Could not find a pull-request for commit "${sha}".`);

  return undefined;
}
