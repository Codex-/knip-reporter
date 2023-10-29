import * as cp from "node:child_process";

import * as ni from "@antfu/ni";
import { afterAll, describe, expect, it, vi } from "vitest";

import { invalidReportJson, reportJson } from "./__fixtures__/knip.fixture.ts";
import {
  buildArraySection,
  buildFilesSection,
  buildMapSection,
  buildMarkdownSections,
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

  describe("buildArraySection", () => {
    it("should transform a dependencies array section to markdown", () => {
      const dependencies = {
        "packages/a/package.json": [
          {
            name: "react",
          },
          {
            name: "react-dom",
          },
        ],
        "packages/d/package.json": [
          {
            name: "react",
          },
        ],
      };

      const section = buildArraySection("dependencies", dependencies);
      expect(section).toMatchSnapshot();
    });

    it("should transform a devDependencies array section to markdown", () => {
      const devDependencies = {
        "packages/a/package.json": [
          {
            name: "dotenv",
          },
          {
            name: "eslint-plugin-jest-dom",
          },
        ],
        "packages/b/package.json": [
          {
            name: "dotenv",
          },
          {
            name: "eslint-plugin-jest-dom",
          },
        ],
        "packages/d/package.json": [
          {
            name: "dotenv",
          },
        ],
      };

      const section = buildArraySection("devDependencies", devDependencies);
      expect(section).toMatchSnapshot();
    });

    it("should transform a optionalPeerDependencies array section to markdown", () => {
      const optionalPeerDependencies = {
        "packages/c/package.json": [
          {
            name: "dotenv",
          },
        ],
        "packages/d/package.json": [
          {
            name: "@mui/material",
          },
        ],
      };

      const section = buildArraySection("optionalPeerDependencies", optionalPeerDependencies);
      expect(section).toMatchSnapshot();
    });

    it("should transform a unlisted array section to markdown", () => {
      const unlisted = {
        ".eslintrc.cjs": [
          {
            name: "@emotion/eslint-plugin",
          },
          {
            name: "eslint-plugin-jest-dom",
          },
        ],
      };

      const section = buildArraySection("unlisted", unlisted);
      expect(section).toMatchSnapshot();
    });

    it("should transform a binaries array section to markdown", () => {
      const binaries = {
        "packages/e/package.json": [
          {
            name: "apollo",
          },
        ],
      };

      const section = buildArraySection("binaries", binaries);
      expect(section).toMatchSnapshot();
    });

    it("should transform a unresolved array section to markdown", () => {
      const unresolved = {
        "jest.config.js": [
          {
            name: "packages/a/src/setupTests.ts",
          },
          {
            name: "packages/a/../b/src",
          },
        ],
      };

      const section = buildArraySection("unresolved", unresolved);
      expect(section).toMatchSnapshot();
    });

    it("should transform a exports array section to markdown", () => {
      const exports = {
        "packages/a/src/Utils.ts": [
          {
            col: 14,
            line: 48,
            name: "specialFunc",
            pos: 1587,
          },
          {
            col: 14,
            line: 50,
            name: "uselessFunc",
            pos: 1686,
          },
        ],
        "packages/a/src/Weapons.ts": [
          {
            col: 14,
            line: 83,
            name: "sheepinator",
            pos: 3858,
          },
        ],
      };

      const section = buildArraySection("exports", exports);
      expect(section).toMatchSnapshot();
    });

    it("should transform a types array section to markdown", () => {
      const types = {
        "packages/a/src/Weapons.ts": [
          {
            col: 13,
            line: 75,
            name: "cowinator",
            pos: 3686,
          },
        ],
        "packages/b/Clank.ts": [
          {
            col: 13,
            line: 7,
            name: "SpecialAgent",
            pos: 310,
          },
          {
            col: 13,
            line: 11,
            name: "Zoni",
            pos: 407,
          },
        ],
        "packages/b/Ratchet.ts": [
          {
            col: 13,
            line: 7,
            name: "Lombax",
            pos: 310,
          },
          {
            col: 13,
            line: 11,
            name: "Homeworld",
            pos: 407,
          },
        ],
      };

      const section = buildArraySection("types", types);
      expect(section).toMatchSnapshot();
    });

    it("should transform a duplicate array array section to markdown", () => {
      const duplicates = {
        "Lombax.ts": [
          [
            {
              name: "Ratchet",
            },
            {
              name: "default",
            },
          ],
        ],
        "WarBot.ts": [
          [
            {
              name: "Kit",
            },
            {
              name: "default",
            },
          ],
        ],
      };

      const section = buildArraySection("duplicates", duplicates);
      expect(section).toMatchSnapshot();
    });
  });

  describe("buildMapSection", () => {
    it("should transform a enumMembers map section to markdown", () => {
      const enumMembers = {
        "DrNefarious.ts": {
          Homeworld: [
            {
              col: 5,
              line: 37,
              name: "Magmos",
              pos: 1273,
            },
            {
              col: 5,
              line: 38,
              name: "Aquatos",
              pos: 1300,
            },
            {
              col: 5,
              line: 39,
              name: "Leviathan ",
              pos: 1317,
            },
            {
              col: 5,
              line: 40,
              name: "TombliOutpost",
              pos: 1317,
            },
            {
              col: 5,
              line: 41,
              name: "Zanifar ",
              pos: 1317,
            },
            {
              col: 5,
              line: 42,
              name: "NefariousSpaceStation ",
              pos: 1317,
            },
            {
              col: 5,
              line: 43,
              name: "NefariousCity",
              pos: 1317,
            },
            {
              col: 5,
              line: 44,
              name: "CorsonV",
              pos: 1317,
            },
          ],
        },
        "Sigmund.ts": {
          Membership: [
            {
              col: 5,
              line: 37,
              name: "ZordoomPrison",
              pos: 1273,
            },
            {
              col: 5,
              line: 38,
              name: "GreatClockStaff",
              pos: 1300,
            },
          ],
          Residence: [
            {
              col: 5,
              line: 37,
              name: "Viceron",
              pos: 1273,
            },
            {
              col: 5,
              line: 38,
              name: "GreatClock",
              pos: 1300,
            },
          ],
        },
      };

      const section = buildMapSection("enumMembers", enumMembers);
      expect(section).toMatchSnapshot();
    });

    it("should transform a classMembers map section to markdown", () => {
      const classMembers = {
        "Qwark.ts": {
          InsaneQwark: [
            {
              col: 9,
              line: 327,
              name: "destroy",
              pos: 12268,
            },
          ],
          SaneQwark: [
            {
              col: 9,
              line: 327,
              name: "rescue",
              pos: 12268,
            },
          ],
        },
        "Rivet.ts": {
          Rivet: [
            {
              col: 9,
              line: 327,
              name: "fly",
              pos: 12268,
            },
            {
              col: 3,
              line: 353,
              name: "swim",
              pos: 12977,
            },
            {
              col: 3,
              line: 357,
              name: "explode",
              pos: 13056,
            },
            {
              col: 3,
              line: 381,
              name: "mutate",
              pos: 13810,
            },
            {
              col: 3,
              line: 388,
              name: "refineGelatonium ",
              pos: 13987,
            },
          ],
        },
      };

      const section = buildMapSection("classMembers", classMembers);
      expect(section).toMatchSnapshot();
    });
  });

  describe("buildMarkdownSections", () => {
    it("processes all parsed sections", () => {
      const parsedReport = parseJsonReport(JSON.stringify(reportJson));
      const mdSections = buildMarkdownSections(parsedReport);

      expect(mdSections).toHaveLength(12);
      for (const section of mdSections) {
        expect(section).toBeTypeOf("string");
      }
      expect(mdSections).toMatchSnapshot();
    });
  });
});
