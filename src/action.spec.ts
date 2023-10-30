import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as core from "@actions/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { type ActionConfig, configToStr, getConfig } from "./action.ts";

vi.mock("@actions/core");

describe("Action", () => {
  let actionInputs: Record<string, { description: string; default: string; required: boolean }>;
  let mockEnvConfig: any;

  beforeAll(async () => {
    // Load the actual action yaml so we can properly assert the defaults
    const rawYml = await readFile(resolve(__dirname, "..", "action.yml"));
    const actionYml = parse(rawYml.toString());
    actionInputs = actionYml.inputs;

    // Emulate the github string replacements
    actionInputs.token!.default = "githubSecret";
    actionInputs.comment_id!.default = "Pull Request-knip-reporter";
  });

  beforeEach(() => {
    mockEnvConfig = {
      token: actionInputs.token?.default,
      command_script_name: actionInputs.command_script_name?.default,
      comment_id: actionInputs.comment_id?.default,
      annotations: actionInputs.annotations?.default,
      verbose: actionInputs.verbose?.default,
      ignore_results: actionInputs.ignore_results?.default,
    };

    vi.spyOn(core, "getInput").mockImplementation((input: string) => {
      switch (input) {
        case "token":
        case "command_script_name":
        case "comment_id":
          return mockEnvConfig[input];
        default:
          throw new Error(`invalid input requested ${input}`);
      }
    });

    vi.spyOn(core, "getBooleanInput").mockImplementation((input: string) => {
      switch (input) {
        case "annotations":
        case "verbose":
        case "ignore_results":
          return mockEnvConfig[input];
        default:
          throw new Error(`invalid input requested ${input}`);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getConfig", () => {
    it("should load the defaults from the yaml", () => {
      const config: ActionConfig = getConfig();

      expect(config.token).toStrictEqual(actionInputs.token?.default);
      expect(config.commandScriptName).toStrictEqual(actionInputs.command_script_name?.default);
      expect(config.commentId).toStrictEqual(
        actionInputs.comment_id?.default.replaceAll(/\s/g, "-"),
      );
      expect(config.ignoreResults).toStrictEqual(actionInputs.ignore_results?.default);
    });

    describe("custom values", () => {
      it("should load a custom value for token", () => {
        mockEnvConfig.token = "newToken";
        const config: ActionConfig = getConfig();

        expect(config.token).toStrictEqual("newToken");
      });

      it("should load a custom value for commandScriptName", () => {
        mockEnvConfig.command_script_name = "custom:knip";
        const config: ActionConfig = getConfig();

        expect(config.commandScriptName).toStrictEqual("custom:knip");
      });

      it("should load a default value for commandScriptName if an empty string is provided", () => {
        mockEnvConfig.command_script_name = "";
        const config: ActionConfig = getConfig();

        expect(config.commandScriptName).toStrictEqual("knip");
      });

      it("should load a custom value for commentId", () => {
        mockEnvConfig.comment_id = "special-comment";
        const config: ActionConfig = getConfig();

        expect(config.commentId).toStrictEqual("special-comment");
      });

      it("should load a custom value for commentId and replace spaces with dashes", () => {
        mockEnvConfig.comment_id = "Special Comment ID";
        const config: ActionConfig = getConfig();

        expect(config.commentId).toStrictEqual("Special-Comment-ID");
      });

      it("should load a custom value for annotations", () => {
        mockEnvConfig.annotations = false;
        const config: ActionConfig = getConfig();

        expect(config.annotations).toStrictEqual(false);
      });

      it("should load a custom value for verbose", () => {
        mockEnvConfig.verbose = true;
        const config: ActionConfig = getConfig();

        expect(config.verbose).toStrictEqual(true);
      });

      it("should load a custom value for ignoreResults", () => {
        mockEnvConfig.ignore_results = true;
        const config: ActionConfig = getConfig();

        expect(config.ignoreResults).toStrictEqual(true);
      });
    });
  });

  describe("configToStr", () => {
    it("should not expose the token", () => {
      const cfgStr = configToStr(getConfig());
      expect(cfgStr).not.toContain(actionInputs.token?.default);
      expect(cfgStr).not.toContain(mockEnvConfig.token);
    });
  });
});
