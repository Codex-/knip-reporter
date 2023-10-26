import * as cp from "node:child_process";

import * as ni from "@antfu/ni";
import { afterAll, describe, expect, it, vi } from "vitest";

import { buildRunKnipCommand, run } from "./knip.ts";

vi.mock("node:child_process");
vi.mock("@actions/core");
vi.mock("@antfu/ni", async () => {
  const actual: typeof import("@antfu/ni") = await vi.importActual("@antfu/ni");
  const toReturn: Record<string, any> = {};
  for (const [key, value] of Object.entries(actual)) {
    toReturn[key] = value;
  }
  return toReturn;
});

describe("knip", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("buildRunKnipCommand", () => {
    it("should build a command with extended JSON reporter", async () => {
      const cmd = await buildRunKnipCommand("knip");

      expect(cmd).toMatch("knip");
      expect(cmd).toMatch("--reporter jsonExt");
    });

    it("should throw if a command could not be generated", async () => {
      vi.spyOn(ni, "getCliCommand").mockImplementation(async () => undefined);

      await expect(async () => buildRunKnipCommand("knip")).rejects.toThrowError(
        "Unable to generate command for package manager",
      );
    });
  });

  describe("run", () => {
    it("returns stdout from the resolved promise", async () => {
      const execSpy = vi.spyOn(cp, "exec").mockImplementation(((
        _cmd: string,
        func: (error: any, stdout: string, stderr: string) => void,
      ) => {
        func(undefined, "resolved promise", "");
      }) as any);
      const results = await run("test cmd");

      expect(execSpy.mock.lastCall?.[0]).toStrictEqual("test cmd");
      expect(results).toStrictEqual("resolved promise");
    });

    it("throws if stderr is rejected by the promise", async () => {
      const execSpy = vi.spyOn(cp, "exec").mockImplementation(((
        _cmd: string,
        func: (error: any, stdout: string, stderr: string) => void,
      ) => {
        func(undefined, "", "rejected promise");
      }) as any);

      await expect(async () => run("test cmd")).rejects.toThrowError("rejected promise");
      expect(execSpy.mock.lastCall?.[0]).toStrictEqual("test cmd");
    });
  });
});
