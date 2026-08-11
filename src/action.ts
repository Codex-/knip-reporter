import path from "node:path";

import * as core from "@actions/core";

import type { CollapseSections } from "./tasks/types.ts";

const COLLAPSE_SECTIONS_VALUES = [
  "auto",
  "always",
  "never",
] as const satisfies readonly CollapseSections[];

export const DEFAULT_KNIP_COMMAND = "knip";

/**
 * action.yaml definition.
 */
export interface ActionConfig {
  /**
   * GitHub API token for making requests.
   */
  token: string;

  /**
   * The npm script that runs knip.
   */
  commandScriptName: string;

  /**
   * ID to use when updating the PR comment.
   */
  commentId: string;

  /**
   * Annotate the project code with the knip results.
   */
  annotations: boolean;

  /**
   * Include annotated items in the comment report.
   */
  verbose: boolean;

  /**
   * Do not fail the action run if knip results are found.
   */
  ignoreResults: boolean;

  /**
   * When to hide a report section's body behind a collapsible block.
   */
  collapseSections: CollapseSections;

  /**
   * Directory in which to run the knip action.
   */
  workingDirectory?: string;

  /**
   * Path to a file that contains the JSON output of a Knip run.
   *
   * If provided, the action will use this instead of running Knip.
   */
  jsonReportPath?: string;
}

function getCollapseSections(): CollapseSections {
  const input = core.getInput("collapse_sections", { required: false }) || "auto";
  const match = COLLAPSE_SECTIONS_VALUES.find((value) => value === input);
  if (!match) {
    throw new Error(
      `Invalid 'collapse_sections' value '${input}', expected one of: ${COLLAPSE_SECTIONS_VALUES.join(", ")}`,
    );
  }
  return match;
}

export function getConfig(): ActionConfig {
  const workingDirectory = core.getInput("working_directory", { required: false }) || undefined;
  const jsonReportPathInput = core.getInput("json_report_path", { required: false });

  return {
    token: core.getInput("token", { required: true }),
    commandScriptName:
      core.getInput("command_script_name", { required: false }) || DEFAULT_KNIP_COMMAND,
    commentId: core.getInput("comment_id", { required: true }).trim().replaceAll(/\s/g, "-"),
    annotations: core.getBooleanInput("annotations", { required: false }),
    verbose: core.getBooleanInput("verbose", { required: false }),
    ignoreResults: core.getBooleanInput("ignore_results", { required: false }),
    collapseSections: getCollapseSections(),
    workingDirectory,
    jsonReportPath: jsonReportPathInput
      ? path.resolve(workingDirectory ?? ".", jsonReportPathInput)
      : undefined,
  };
}

export function configToStr(cfg: ActionConfig): string {
  return `  with config:
    token: ###
    command_script_name: ${cfg.commandScriptName}
    comment_id: ${cfg.commentId}
    annotations: ${cfg.annotations}
    verbose: ${cfg.verbose}
    ignoreResults: ${cfg.ignoreResults}
    collapseSections: ${cfg.collapseSections}
    workingDirectory: ${cfg.workingDirectory}
    jsonReportPath: ${cfg.jsonReportPath}
`;
}
