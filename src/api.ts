import * as core from "@actions/core";
import * as github from "@actions/github";

import { type ActionConfig, getConfig } from "./action.ts";

export const GITHUB_COMMENT_MAX_COMMENT_LENGTH = 65535;

type Octokit = ReturnType<(typeof github)["getOctokit"]>;

let config: ActionConfig;
let octokit: Octokit;

export function init(cfg?: ActionConfig): void {
  config = cfg ?? getConfig();
  octokit = github.getOctokit(config.token);
}

type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

type CreateCommentResponse = Awaited<ReturnType<Octokit["rest"]["issues"]["createComment"]>>;
export async function createComment(
  pullRequestNumber: number,
  body: string,
): Promise<CreateCommentResponse> {
  // https://docs.github.com/en/rest/issues/comments#create-an-issue-comment
  const response = await octokit.rest.issues.createComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: pullRequestNumber,
    body: body,
  });

  if (response.status !== 201) {
    throw new Error(`Failed to create comment, expected 201 but received ${response.status}`);
  }

  return response;
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
  for await (const { data, status } of restIter) {
    if (status !== 200) {
      throw new Error(`Failed to find comment ID, expected 200 but received ${status}`);
    }

    for (const { id, body } of data) {
      if (!body) {
        continue;
      }

      if (body?.includes(cfgCommentId)) {
        messageIds.push(id);
      }
    }
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
  const response = await octokit.rest.issues.updateComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    comment_id: commentId,
    body: body,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to update comment, expected 200 but received ${response.status}`);
  }

  return response;
}

type DeleteCommentResponse = Awaited<ReturnType<Octokit["rest"]["issues"]["deleteComment"]>>;
export async function deleteComment(commentId: number): Promise<DeleteCommentResponse> {
  // https://docs.github.com/en/rest/issues/comments#delete-an-issue-comment
  const response = await octokit.rest.issues.deleteComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    comment_id: commentId,
  });

  if (response.status !== 204) {
    throw new Error(`Failed to delete comment, expected 204 but received ${response.status}`);
  }

  return response;
}

type CreateCheckResponse = Awaited<ReturnType<Octokit["rest"]["checks"]["create"]>>;
export async function createCheck(name: string, title: string): Promise<CreateCheckResponse> {
  if (github.context.payload.pull_request?.head.sha === undefined) {
    core.warning("Unable to find correct head_sha from payload, using base context sha");
  }

  // https://docs.github.com/en/rest/checks/runs#create-a-check-run
  const response = await octokit.rest.checks.create({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    name: name,
    head_sha: github.context.payload.pull_request?.head.sha ?? github.context.sha,
    status: "in_progress",
    output: {
      title: title,
      summary: "",
    },
  });

  if (response.status !== 201) {
    throw new Error(`Failed to create check, expected 201 but received ${response.status}`);
  }

  return response;
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
  const response = await octokit.rest.checks.update({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    check_run_id: checkRunId,
    status: status,
    conclusion: conclusion,
    output: output,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to update check, expected 200 but received ${response.status}`);
  }

  return response;
}
