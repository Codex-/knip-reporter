import * as core from "@actions/core";

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
   * Directory in which to run the knip action.
   */
  workingDirectory?: string;
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    commandScriptName: core.getInput("command_script_name", { required: false }) || "knip",
    commentId: core.getInput("comment_id", { required: true }).trim().replaceAll(/\s/g, "-"),
    annotations: core.getBooleanInput("annotations", { required: false }),
    verbose: core.getBooleanInput("verbose", { required: false }),
    ignoreResults: core.getBooleanInput("ignore_results", { required: false }),
    workingDirectory: core.getInput("working_directory", { required: false }) || undefined,
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
    workingDirectory: ${cfg.workingDirectory}
`;
}
