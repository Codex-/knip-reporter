import * as core from "@actions/core";
import * as github from "@actions/github";

import { configToStr, DEFAULT_KNIP_COMMAND, getConfig } from "./action.ts";
import { init } from "./api.ts";
import {
  AnnotationsCount,
  createCheckId,
  resolveCheck,
  updateCheckAnnotations,
} from "./tasks/check.ts";
import { runCommentTask } from "./tasks/comment.ts";
import { runKnipTasks } from "./tasks/knip.ts";
import { timeTask } from "./tasks/task.ts";

export async function main(): Promise<void> {
  try {
    const config = getConfig();
    const actionMs = Date.now();

    if (config.jsonReportPath && config.commandScriptName !== DEFAULT_KNIP_COMMAND) {
      core.warning("command_script_name config will be ignored when json_report_path is provided");
    }

    core.info("- knip-reporter action");
    core.info(configToStr(config));

    if (github.context.payload.pull_request === undefined) {
      throw new TypeError(
        `knip-reporter currently only supports 'pull_request' events, current event: ${github.context.eventName}`,
      );
    }

    init(config);

    let checkId: number | undefined;
    if (config.annotations) {
      checkId = await timeTask("Create check ID", () =>
        createCheckId("knip-reporter-annotations-check", "Knip reporter analysis"),
      );
    }

    const { sections: knipSections, annotations: knipAnnotations } = await runKnipTasks({
      buildScriptName: config.commandScriptName,
      jsonReportPath: config.jsonReportPath,
      annotationsEnabled: config.annotations,
      verboseEnabled: config.verbose,
      cwd: config.workingDirectory,
    });
    const hasFindings = knipSections.length > 0 || knipAnnotations.length > 0;

    await runCommentTask(
      config.commentId,
      github.context.payload.pull_request.number,
      knipSections,
    );

    let counts = new AnnotationsCount();
    if (checkId !== undefined) {
      counts = await updateCheckAnnotations(checkId, knipAnnotations, config.ignoreResults);
    }

    if (!config.ignoreResults && hasFindings) {
      core.setFailed("knip has resulted in findings, please see the report for more details");
    }

    if (checkId !== undefined) {
      // Handle errors here so teardown failures don't leak to the catch
      // and end up overriding `setFailed` with the wrong message.
      try {
        const conclusion = !config.ignoreResults && hasFindings ? "failure" : "success";
        await resolveCheck(checkId, conclusion, counts);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        core.warning(`Unable to resolve check: ${detail}`);
      }
    }

    core.info(`✔ knip-reporter action (${Date.now() - actionMs}ms)`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    core.error(`🧨 Failed: ${err.message}`);
    core.error(`📚 Stack: ${err.stack ?? ""}`);
    core.setFailed(err);
  }
}
