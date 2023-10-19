import * as github from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils.ts";
import { type ActionConfig, getConfig } from "./action.ts";

export const GITHUB_COMMENT_MAX_COMMENT_LENGTH = 65535;

type Octokit = InstanceType<typeof GitHub>;

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

export async function getCommentIds(
  cfgCommentId: string,
  pullRequestNumber: number,
): Promise<number[] | undefined> {
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

  return messageIds.length > 0 ? messageIds : undefined;
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
  // https://docs.github.com/en/rest/issues/comments#update-an-issue-comment
  const response = await octokit.rest.issues.deleteComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    comment_id: commentId,
  });

  if (response.status !== 204) {
    throw new Error(`Failed to update comment, expected 204 but received ${response.status}`);
  }

  return response;
}
