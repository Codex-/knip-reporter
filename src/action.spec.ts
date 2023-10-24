import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as core from "@actions/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { type ActionConfig, getConfig } from "./action.ts";

vi.mock("@actions/core");

describe("Action", () => {
  describe("getConfig", () => {
    let actionInputs: Record<string, { description: string; default: string; required: boolean }>;
    let mockEnvConfig: any;

    beforeAll(async () => {
      // Load the actual action yaml so we can properly assert the defaults
      const rawYml = await readFile(resolve(__dirname, "..", "action.yml"));
      const actionYml = parse(rawYml.toString());
      actionInputs = actionYml.inputs;
    });

    beforeEach(() => {
      mockEnvConfig = {
        token: actionInputs.token?.default,
        command_script_name: actionInputs.command_script_name?.default,
        comment_id: actionInputs.comment_id?.default,
        ignore_results: actionInputs.ignore_results?.default,
      };

      vi.spyOn(core, "getInput").mockImplementation((input: string) => {
        switch (input) {
          case "token":
          case "command_script_name":
          case "comment_id":
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

    it("should load the defaults from the yaml", () => {
      const config: ActionConfig = getConfig();

      expect(config.token).toStrictEqual(actionInputs.token?.default);
      expect(config.commandScriptName).toStrictEqual(actionInputs.command_script_name?.default);
      expect(config.commentId).toStrictEqual(actionInputs.comment_id?.default);
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

      it("should load a custom value for commentId", () => {
        mockEnvConfig.comment_id = "special-comment";
        const config: ActionConfig = getConfig();

        expect(config.commentId).toStrictEqual("special-comment");
      });

      it("should load a custom value for ignoreResults", () => {
        mockEnvConfig.ignore_results = "true";
        const config: ActionConfig = getConfig();

        expect(config.ignoreResults).toStrictEqual(true);
      });
    });
  });
});
