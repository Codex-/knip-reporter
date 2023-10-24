import * as core from "@actions/core";

import {
  GITHUB_COMMENT_MAX_COMMENT_LENGTH,
  createComment,
  deleteComment,
  getCommentIds,
  updateComment,
} from "../api.ts";
import type { Task } from "./task.ts";

function createCommentId(cfgCommentId: string, n: number): string {
  const id = `<!-- ${cfgCommentId.trim().replaceAll(/\s/g, "-")}-${n} -->`;
  core.debug(`[createCommentId]: Generated '${id}'`);
  return id;
}

// Double newlines for markdown
const COMMENT_SECTION_DELIMITER = "\n\n";

let commentsToPost: string[];

function prepareComments(cfgCommentId: string, reportSections: string[]) {
  core.debug(`[prepareComments]: ${reportSections} sections to prepare`);
  const comments: string[] = [];

  let currentCommentEntryNumber = 0;
  let currentCommentSections: string[] = [createCommentId(cfgCommentId, currentCommentEntryNumber)];
  let currentCommentLength = currentCommentSections[0]?.length ?? 0;
  let currentSectionIndex = 0;
  while (currentSectionIndex < reportSections.length) {
    const section = reportSections[currentSectionIndex];
    if (section === undefined) {
      break;
    }

    const newLength = currentCommentLength + section.length + COMMENT_SECTION_DELIMITER.length;
    if (newLength < GITHUB_COMMENT_MAX_COMMENT_LENGTH) {
      currentCommentLength = newLength;
      currentCommentSections.push(section);
      currentSectionIndex++;
      continue;
    }

    if (section.length > GITHUB_COMMENT_MAX_COMMENT_LENGTH) {
      const sectionHeader = section.split("\n")[0] ?? "";
      core.warning(`Section "${sectionHeader}" contents too long to post (${section.length})`);
      core.warning(`Skipping this section, please see output below:`);
      core.warning(section);
      currentSectionIndex++;
    }

    // Current comment is now complete
    comments.push(currentCommentSections.join(COMMENT_SECTION_DELIMITER));

    // Increase the number for comment IDs
    currentCommentEntryNumber++;
    // Reset the sections to just the new comment ID header
    currentCommentSections = [createCommentId(cfgCommentId, currentCommentEntryNumber)];
    // Reset the length to the newly generated comment ID header
    currentCommentLength = currentCommentSections[0]?.length ?? 0;
  }

  core.debug(`[prepareComments]: ${comments.length} comments prepared`);
  commentsToPost = comments;
}

/**
 * @returns a collection of IDs that were not updated but extraneously remain
 */
async function createOrUpdateComments(
  pullRequestNumber: number,
  existingCommentIds?: number[],
): Promise<number[]> {
  let existingIdsIndex = 0;
  for (const comment of commentsToPost) {
    if (existingCommentIds && existingCommentIds[existingIdsIndex] !== undefined) {
      const commentId = existingCommentIds[existingIdsIndex]!;
      await updateComment(commentId, comment);
      core.debug(`[createOrUpdateComments]: updated comment (${commentId})`);
      existingIdsIndex++;
      continue;
    }
    await createComment(pullRequestNumber, comment);
  }

  // Extraneous comments should be deleted
  if (existingCommentIds && existingCommentIds?.length > existingIdsIndex) {
    const toDelete = existingCommentIds.slice(existingIdsIndex);
    core.debug(`[createOrUpdateComments]: extraneous comments to delete: [${toDelete.join(", ")}]`);
    return toDelete;
  }

  return [];
}

async function deleteExtraneousComments(commentIds: number[]): Promise<void> {
  for (const id of commentIds) {
    core.info(`    - Delete comment ${id}`);
    await deleteComment(id);
    core.info(`    ✔ Delete comment ${id}`);
  }
}

export function buildCommentTask(
  cfgCommentId: string,
  pullRequestNumber: number,
  reportSections: string[],
) {
  return {
    name: "Comment",
    steps: [
      {
        name: "Prepend ID to comment body",
        action: () => prepareComments(cfgCommentId, reportSections),
      },
      {
        name: "Find existing comment IDs",
        action: () => getCommentIds(cfgCommentId, pullRequestNumber),
      },
      {
        name: "Create or update comment",
        action: (existingCommentIds?: number[]) =>
          createOrUpdateComments(pullRequestNumber, existingCommentIds),
      },
      {
        name: "Delete extraneous comments",
        action: (remainingComments: number[]) => {
          if (remainingComments.length === 0) {
            return;
          }
          return deleteExtraneousComments(remainingComments);
        },
      },
    ] as const,
  } satisfies Task;
}
