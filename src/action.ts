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
   * ID to use when updating the PR comment
   */
  commentId: string;

  /**
   * Do not fail the action run if knip results are found
   */
  ignoreResults: boolean;
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    commandScriptName: core.getInput("command_script_name", { required: false }) || "knip",
    commentId: core.getInput("comment_id", { required: true }),
    ignoreResults: core.getInput("comment_id", { required: false }) === "true",
  };
}

/**
 * @param indent indentation multiplier
 */
export function configToStr(cfg: ActionConfig): string {
  return `  with config:
    token: ###
    command_script_name: ${cfg.commandScriptName}
    comment_id: ${cfg.commentId}
`;
}
