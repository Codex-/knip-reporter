import * as core from "@actions/core";

import { createComment, deleteComment, getCommentIds, updateComment } from "../api.ts";
import type { Task } from "./task.ts";

const GITHUB_COMMENT_MAX_COMMENT_LENGTH = 65535;

function createCommentId(cfgCommentId: string, n: number): string {
  return `<!-- ${cfgCommentId}-${n} -->`;
}

// Double newlines for markdown
const COMMENT_SECTION_DELIMITER = "\n\n";

let commentsToPost: string[];

function prepareComments(cfgCommentId: string, reportSections: string[]) {
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

    comments.push(currentCommentSections.join(COMMENT_SECTION_DELIMITER));
    // Increase the number for comment IDs
    currentCommentEntryNumber++;
    // Reset the sections to just the new comment ID header
    currentCommentSections = [createCommentId(cfgCommentId, currentCommentEntryNumber)];
    // Reset the length to the newly generated comment ID header
    currentCommentLength = currentCommentSections[0]?.length ?? 0;
  }

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
      await updateComment(existingCommentIds[existingIdsIndex]!, comment);
      existingIdsIndex++;
      continue;
    }
    await createComment(pullRequestNumber, comment);
  }

  // Extraneous comments should be deleted
  if (existingCommentIds && existingCommentIds?.length > existingIdsIndex) {
    return existingCommentIds.slice(existingIdsIndex);
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
