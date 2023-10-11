import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ActionConfig, getConfig } from "./action.ts";

vi.mock("@actions/core");

describe("Action", () => {
  describe("getConfig", () => {
    // Represent the process.env inputs.
    let mockEnvConfig: any;

    beforeEach(() => {
      mockEnvConfig = {};

      vi.spyOn(core, "getInput").mockImplementation((input: string) => {
        switch (input) {
          case "commandScriptName":
            return mockEnvConfig.commandScriptName ?? "";
          default:
            throw new Error("invalid input requested");
        }
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return a valid config", () => {
      const config: ActionConfig = getConfig();

      // Assert that the numbers / types have been properly loaded.
      expect(config.commandScriptName).toStrictEqual("knip");
    });

    it("should provide a default command script name if none is supplied", () => {
      mockEnvConfig.commandScriptName = "custom:knip";
      const config: ActionConfig = getConfig();

      expect(config.commandScriptName).toStrictEqual("custom:knip");
    });
  });
});
