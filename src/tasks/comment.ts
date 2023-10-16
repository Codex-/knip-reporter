import { createComment, getCommentId, updateComment } from "../api.ts";
import type { Task } from "./task.ts";

function createCommentId(cfgCommentId: string): string {
  return `<!-- ${cfgCommentId} -->`;
}

let commentBody: string;
function setCommentBody(body: string): void {
  commentBody = body;
}

export function buildCommentTask(
  cfgCommentId: string,
  pullRequestNumber: number,
  messageBody: string,
) {
  return {
    name: "Comment",
    steps: [
      {
        name: "Prepend ID to comment body",
        action: () => {
          const commentId = createCommentId(cfgCommentId);
          const joinedBody = commentId + "\n\n" + messageBody;
          setCommentBody(joinedBody);
        },
      },
      {
        name: "Find existing comment ID",
        action: () => getCommentId(cfgCommentId, pullRequestNumber),
      },
      {
        name: "Create or update comment",
        action: async (existingCommentId?: number) => {
          if (existingCommentId !== undefined) {
            return updateComment(existingCommentId, commentBody);
          }
          return createComment(pullRequestNumber, commentBody);
        },
      },
    ] as const,
  } satisfies Task;
}
