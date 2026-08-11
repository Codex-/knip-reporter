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

const REPORT_WARNING =
  "> [!WARNING]\n> Knip has reported the following issues with the proposed changes";

/**
 * Largest section a comment can carry. The 512 reserve leaves room for the
 * comment preamble (id and warning) plus delimiters.
 */
export const COMMENT_SECTION_BUDGET = GITHUB_COMMENT_MAX_COMMENT_LENGTH - 512;

export function buildComments(cfgCommentId: string, reportSections: string[]): string[] {
  core.debug(`[prepareComments]: ${reportSections.length} sections to prepare`);
  const comments: string[] = [];

  // The warning is packed as the leading section, so it stays on the first
  // posted comment even when the first report section overflows or is dropped.
  const sections = reportSections.length > 0 ? [REPORT_WARNING, ...reportSections] : [];

  let currentCommentSections: string[] = [];
  let currentCommentLength = 0;
  // Comments are numbered by what has been pushed, keeping ids contiguous
  // even when a section is dropped.
  const startNewComment = (): void => {
    const commentId = createCommentId(cfgCommentId, comments.length);
    currentCommentSections = [commentId];
    currentCommentLength = commentId.length;
  };
  startNewComment();

  let currentSectionIndex = 0;
  while (currentSectionIndex < sections.length) {
    const section = sections[currentSectionIndex];
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
      if (currentSectionIndex < sections.length) {
        continue;
      }
    }

    // The comment id is the smallest preamble a section can share a comment
    // with, so a section overflowing an otherwise-empty comment can never be
    // posted. Skipping it here keeps the loop advancing.
    const sectionUnpostable =
      currentCommentSections.length === 1 && newLength >= GITHUB_COMMENT_MAX_COMMENT_LENGTH;
    if (sectionUnpostable) {
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

    startNewComment();
  }

  core.debug(`[prepareComments]: ${comments.length} comments prepared`);

  return comments;
}

/**
 * @returns a collection of IDs that were not updated but extraneously remain
 */
export async function createOrUpdateComments(
  pullRequestNumber: number,
  commentsToPost: string[],
  existingCommentIds?: number[],
): Promise<number[]> {
  let existingIdsIndex = 0;
  for (const comment of commentsToPost) {
    const commentId = existingCommentIds?.[existingIdsIndex];
    if (commentId !== undefined) {
      await updateComment(commentId, comment);
      core.debug(`[createOrUpdateComments]: updated comment (${commentId})`);
      existingIdsIndex++;
      continue;
    }
    const response = await createComment(pullRequestNumber, comment);
    core.debug(`[createOrUpdateComments]: created comment (${response.data.id})`);
  }

  // Extraneous comments should be deleted
  if (existingCommentIds && existingCommentIds.length > existingIdsIndex) {
    const toDelete = existingCommentIds.slice(existingIdsIndex);
    core.debug(`[createOrUpdateComments]: extraneous comments to delete: [${toDelete.join(", ")}]`);
    return toDelete;
  }

  return [];
}

export async function deleteComments(commentIds: number[]): Promise<void> {
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
    buildComments(cfgCommentId, reportSections),
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
    return deleteComments(remainingComments);
  });

  core.info(`✔ Running comment tasks (${Date.now() - taskMs}ms)`);
}
