import * as core from "@actions/core";

import {
  createComment,
  deleteComment,
  GITHUB_COMMENT_MAX_COMMENT_LENGTH,
  listCommentIds,
  updateComment,
} from "../api.ts";
import { timeTask } from "./task.ts";

function createCommentId(cfgCommentId: string, n: number): string {
  const id = `<!-- ${cfgCommentId}-${n} -->`;
  core.debug(`[createCommentId]: Generated '${id}'`);
  return id;
}

// Double newlines for markdown
const COMMENT_SECTION_DELIMITER = "\n\n";

function prepareComments(cfgCommentId: string, reportSections: string[]): string[] {
  core.debug(`[prepareComments]: ${reportSections.length} sections to prepare`);
  const comments: string[] = [];

  let currentCommentEntryNumber = 0;
  let currentCommentSections: string[] = [createCommentId(cfgCommentId, currentCommentEntryNumber)];
  let currentCommentLength = currentCommentSections[0]?.length ?? 0;
  let currentSectionIndex = 0;
  while (currentSectionIndex < reportSections.length) {
    const section = reportSections[currentSectionIndex];
    if (section === undefined) {
      // Due to the while condition, this should never be reached.
      core.debug(
        `[prepareComments]: section ${currentSectionIndex} is undefined, ending generation`,
      );
      break;
    }

    const newLength = currentCommentLength + section.length + COMMENT_SECTION_DELIMITER.length;
    if (newLength < GITHUB_COMMENT_MAX_COMMENT_LENGTH) {
      currentCommentLength = newLength;
      currentCommentSections.push(section);
      core.debug(
        `[prepareComments]: section ${currentSectionIndex} added to currentCommentSections`,
      );

      currentSectionIndex++;

      // If we are at the end of the sections, we do not continue but simply
      // proceed to add the comment sections to the output.
      if (currentSectionIndex - 1 < reportSections.length - 1) {
        continue;
      }
    }

    if (section.length > GITHUB_COMMENT_MAX_COMMENT_LENGTH) {
      const sectionHeader = section.split("\n")[0] ?? "";
      core.warning(`Section "${sectionHeader}" contents too long to post (${section.length})`);
      core.warning(`Skipping this section, please see output below:`);
      core.warning(section);
      currentSectionIndex++;
    }

    if (currentCommentSections.length > 1) {
      // Current comment is now complete
      comments.push(currentCommentSections.join(COMMENT_SECTION_DELIMITER));
      core.debug(`[prepareComments]: currentCommentSections joined and added to comments`);
    }

    // Increase the number for comment IDs
    currentCommentEntryNumber++;
    // Reset the sections to just the new comment ID header
    currentCommentSections = [createCommentId(cfgCommentId, currentCommentEntryNumber)];
    // Reset the length to the newly generated comment ID header
    currentCommentLength = currentCommentSections[0]?.length ?? 0;
  }

  core.debug(`[prepareComments]: ${comments.length} comments prepared`);

  return comments;
}

/**
 * @returns a collection of IDs that were not updated but extraneously remain
 */
async function createOrUpdateComments(
  pullRequestNumber: number,
  commentsToPost: string[],
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
    const response = await createComment(pullRequestNumber, comment);
    core.debug(`[createOrUpdateComments]: created comment (${response.data.id})`);
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

export async function runCommentTask(
  cfgCommentId: string,
  pullRequestNumber: number,
  reportSections: string[],
): Promise<void> {
  const taskMs = Date.now();
  core.info("- Running comment tasks");

  const comments = await timeTask("Prepare comments", () =>
    prepareComments(cfgCommentId, reportSections),
  );
  const existingCommentIds = await timeTask("Find existing comment IDs", () =>
    listCommentIds(cfgCommentId, pullRequestNumber),
  );
  const remainingComments = await timeTask("Create or update comment", () =>
    createOrUpdateComments(pullRequestNumber, comments, existingCommentIds),
  );
  await timeTask("Delete extraneous comments", () => {
    if (remainingComments.length === 0) {
      return;
    }
    return deleteExtraneousComments(remainingComments);
  });

  core.info(`✔ Running comment tasks (${Date.now() - taskMs}ms)`);
}
