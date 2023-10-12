import * as core from "@actions/core";

/**
 * action.yaml definition.
 */
export interface ActionConfig {
  /**
   * The npm script that runs knip.
   */
  commandScriptName: string;
}

export function getConfig(): ActionConfig {
  return {
    commandScriptName: core.getInput("commandScriptName") || "knip",
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
