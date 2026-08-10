import * as core from "@actions/core";

import { configToStr, DEFAULT_KNIP_COMMAND, getConfig } from "./action.ts";
import { init } from "./api.ts";
import { getPullRequestNumber } from "./github-utils/get-pull-request-number.ts";
import { isInsufficientPermissionsError } from "./github-utils/is-insufficient-permissions-error.ts";
import {
  AnnotationsCount,
  createCheckId,
  resolveCheck,
  updateCheckAnnotations,
} from "./tasks/check.ts";
import { runCommentTask } from "./tasks/comment.ts";
import { runKnipTasks } from "./tasks/knip.ts";
import { timeTask } from "./tasks/task.ts";

/**
 * Runs a task requiring a write-scoped token. A read-only token, such as a
 * fork's `pull_request` run, rejects writes with a 403. Reporting what we can
 * beats failing the run, so skip the task with a warning.
 *
 * @returns the task's result, or undefined when skipped
 */
async function runIfPermitted<T>(
  task: () => Promise<T>,
  skipWarning: string,
): Promise<T | undefined> {
  try {
    return await task();
  } catch (error) {
    if (!isInsufficientPermissionsError(error)) {
      throw error;
    }

    core.warning(skipWarning);
    return undefined;
  }
}

export async function main(): Promise<void> {
  try {
    const config = getConfig();
    const actionMs = Date.now();

    if (config.jsonReportPath && config.commandScriptName !== DEFAULT_KNIP_COMMAND) {
      core.warning("command_script_name config will be ignored when json_report_path is provided");
    }

    core.info("- knip-reporter action");
    core.info(configToStr(config));

    init(config);

    let checkId: number | undefined;
    if (config.annotations) {
      checkId = await runIfPermitted(
        () =>
          timeTask("Create check ID", () =>
            createCheckId("knip-reporter-annotations-check", "Knip reporter analysis"),
          ),
        "Unable to create a check: the GITHUB_TOKEN lacks 'checks: write' permission. Skipping annotations.",
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

    // Creating a comment requires an associated PR to work against.
    // In the case where this action is triggered by a non-pr event, we skip
    // the comment creation task.
    const pullRequestNumber = await getPullRequestNumber();
    if (pullRequestNumber) {
      await runIfPermitted(
        () => runCommentTask(config.commentId, pullRequestNumber, knipSections),
        "Unable to post the report: the GITHUB_TOKEN lacks 'pull-requests: write' permission. Skipping the comment.",
      );
    } else {
      core.info("No pull request associated with this event, skipping comment creation");
    }

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
