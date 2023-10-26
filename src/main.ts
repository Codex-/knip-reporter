import * as core from "@actions/core";
import * as github from "@actions/github";

import { configToStr, getConfig } from "./action.ts";
import { init } from "./api.ts";
import { runCommentTask } from "./tasks/comment.ts";
import { runKnipTasks } from "./tasks/knip.ts";

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

    init(config);

    const knipTaskResult = await runKnipTasks(config.commandScriptName, config.annotations);

    await runCommentTask(
      config.commentId,
      github.context.payload.pull_request.number,
      knipTaskResult,
    );

    if (!config.ignoreResults && knipTaskResult.length > 0) {
      core.setFailed("knip has resulted in findings, please see the report for more details");
    }

    core.info(`✔ knip-reporter action (${Date.now() - actionMs}ms)`);
  } catch (error) {
    if (error instanceof Error) {
      core.error(`🧨 Failed: ${error.message}`);
      core.error(`📚 Stack: ${error.stack ?? ""}`);
      core.setFailed(error);
      return;
    }

    core.setFailed(`🧨 Failed: ${error}`);
  }
}

(() => run())();
