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
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    commandScriptName: core.getInput("commandScriptName", { required: false }) || "knip",
    commentId: core.getInput("token", { required: true }),
  };
}

/**
 * @param indent indentation multiplier
 */
export function configToStr(cfg: ActionConfig): string {
  return `  with config:
    token: ###
    commandScriptName: ${cfg.commandScriptName}
`;
}
