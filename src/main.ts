import * as core from "@actions/core";
import { getConfig } from "./action.ts";
import { buildTask } from "./tasks/knip.ts";
import { executeTask } from "./tasks/task.ts";

async function run(): Promise<void> {
  try {
    const config = getConfig();
    const actionMs = Date.now();

    core.info("- knip-reporter action");
    core.info(`  commandScriptName: ${config.commandScriptName}`);

    const knipTask = buildTask(config.commandScriptName);

    await executeTask(knipTask);

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
