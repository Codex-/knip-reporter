import * as core from "@actions/core";
import * as github from "@actions/github";

import { configToStr, getConfig } from "./action.ts";
import { init } from "./api.ts";
import { createCheckId, resolveCheck, updateCheckAnnotations } from "./tasks/check.ts";
import { runCommentTask } from "./tasks/comment.ts";
import { runKnipTasks } from "./tasks/knip.ts";
import { timeTask } from "./tasks/task.ts";

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

    let checkId: number;
    if (config.annotations) {
      checkId = await timeTask("Create check ID", () => createCheckId());
    }

    const { sections: knipSections, annotations: knipAnnotations } = await runKnipTasks(
      config.commandScriptName,
      config.annotations,
      config.verbose,
    );

    await runCommentTask(
      config.commentId,
      github.context.payload.pull_request.number,
      knipSections,
    );

    if (config.annotations) {
      await updateCheckAnnotations(checkId!, knipAnnotations);
    }

    if (!config.ignoreResults && knipSections.length > 0) {
      core.setFailed("knip has resulted in findings, please see the report for more details");
    }

    if (config.annotations) {
      if (!config.ignoreResults && (knipSections.length > 0 || knipAnnotations.length > 0)) {
        await resolveCheck(checkId!, "failure");
      } else {
        await resolveCheck(checkId!, "success");
      }
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
