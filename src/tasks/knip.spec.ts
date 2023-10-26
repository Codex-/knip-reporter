import * as cp from "node:child_process";

import * as ni from "@antfu/ni";
import { afterAll, describe, expect, it, vi } from "vitest";

import { invalidReportJson, reportJson } from "./__fixtures__/knip.fixture.ts";
import {
  buildFilesSection,
  buildRunKnipCommand,
  buildSectionName,
  parseJsonReport,
  run,
} from "./knip.ts";

vi.mock("node:child_process");
vi.mock("@actions/core");
vi.mock("@antfu/ni", async () => {
  const actual: typeof import("@antfu/ni") = await vi.importActual("@antfu/ni");
  const toReturn: Record<string, any> = {};
  for (const [key, value] of Object.entries(actual)) {
    // Makes keys mutable, as writable=true is the
    // default descriptor when assigning to an object
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

  describe("parseJsonReport", () => {
    it("should parse the knip output", () => {
      const parsedReport = parseJsonReport(JSON.stringify(reportJson));
      expect(parsedReport).toMatchSnapshot();
    });

    it("should not attempt to handle an undefined or null key", () => {
      const parsedReport = parseJsonReport(JSON.stringify(invalidReportJson));
      expect(parsedReport).toMatchSnapshot();
    });
  });

  describe("buildFilesSection", () => {
    it("should return markdown for a collection of files", () => {
      const filesSection = buildFilesSection(["Ratchet.ts", "Clank.ts"]);
      expect(filesSection).toMatchSnapshot();
    });

    it("should display the count of files in the header", () => {
      let filesSection = buildFilesSection(["Ratchet.ts", "Clank.ts"]);
      expect(filesSection.split("\n")[0]).toStrictEqual("### Unused files (2)");

      filesSection = buildFilesSection(["Ratchet.ts", "Clank.ts", "DrNefarious.ts"]);
      expect(filesSection.split("\n")[0]).toStrictEqual("### Unused files (3)");
    });

    it("should wrap each file with backticks to render as code", () => {
      const files = ["Ratchet.ts", "Clank.ts", "DrNefarious.ts"];
      const filesSection = buildFilesSection(files).split("\n");
      const filesLine = filesSection[filesSection.length - 1]?.split(", ") ?? [];

      for (let i = 0; i < files.length; i++) {
        expect(filesLine[i]).toStrictEqual(`\`${files[i]}\``);
      }
    });
  });

  describe("buildSectionName", () => {
    it("should return human readable names for a given section", () => {
      expect(buildSectionName("dependencies")).toStrictEqual("Unused dependencies");
      expect(buildSectionName("devDependencies")).toStrictEqual("Unused devDependencies");
      expect(buildSectionName("optionalPeerDependencies")).toStrictEqual(
        "Unused optionalPeerDependencies",
      );
      expect(buildSectionName("exports")).toStrictEqual("Unused exports");
      expect(buildSectionName("types")).toStrictEqual("Unused types");
      expect(buildSectionName("unresolved")).toStrictEqual("Unresolved imports");
      expect(buildSectionName("binaries")).toStrictEqual("Unlisted binaries");
      expect(buildSectionName("unlisted")).toStrictEqual("Unlisted dependencies");
      expect(buildSectionName("duplicates")).toStrictEqual("Duplicates");
    });

    it("should throw if an unknown section name is provided", () => {
      expect(() => buildSectionName("sheepinator")).toThrowError("Unknown name: sheepinator");
    });
  });
});
