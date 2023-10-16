import * as core from "@actions/core";
import * as github from "@actions/github";
import { configToStr, getConfig } from "./action.ts";
import { buildKnipTask } from "./tasks/knip.ts";
import { executeTask } from "./tasks/task.ts";
import { buildCommentTask } from "./tasks/comment.ts";

async function run(): Promise<void> {
  try {
    const config = getConfig();
    const actionMs = Date.now();

    core.info("- knip-reporter action");
    core.info(configToStr(config));

    if (github.context.payload.pull_request === undefined) {
      throw new Error(
        `knip-reporter currently only supports 'pull_request' events, current event: ${github.context.eventName}`,
      );
    }

    const knipTask = buildKnipTask(config.commandScriptName);
    type KnipFinalStepResult = ReturnType<(typeof knipTask.steps)[3]["action"]>;
    const knipTaskResult = await executeTask<KnipFinalStepResult>(knipTask);

    const commentTask = buildCommentTask(
      config.commentId,
      github.context.payload.pull_request.number,
      knipTaskResult,
    );
    await executeTask(commentTask);

    core.info(`✔ knip-reporter action (${Date.now() - actionMs}ms)`);
  } catch (error) {
    if (error instanceof Error) {
      core.error(`🧨 Failed: ${error.message}`);
      core.error(`📚 Stack: ${error.stack ?? ""}`);
      core.setFailed(error.message);
    }
  }
}

(() => run())();
