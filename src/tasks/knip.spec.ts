import * as cp from "node:child_process";

import * as core from "@actions/core";
import * as ni from "@antfu/ni";
import { afterAll, describe, expect, it, vi } from "vitest";

import { invalidReportJson, reportJson } from "./__fixtures__/knip.fixture.ts";
import {
  buildArraySection,
  buildArraySectionWithAnnotations,
  buildFilesSection,
  buildMapSection,
  buildMarkdownSections,
  buildRunKnipCommand,
  buildSectionName,
  getJsonFromOutput,
  parseJsonReport,
  processSectionToMessages,
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
      expect(cmd).toMatch("--reporter json");
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

    it("emits a warning log if stderr isn't empty", async () => {
      const warnSpy = vi.spyOn(core, "warning");
      const execSpy = vi.spyOn(cp, "exec").mockImplementation(((
        _cmd: string,
        func: (error: any, stdout: string, stderr: string) => void,
      ) => {
        func(undefined, "", "stderr output");
      }) as any);

      await run("test cmd");

      expect(warnSpy.mock.lastCall?.[0]).toStrictEqual("knip stderr:\nstderr output");
      expect(execSpy.mock.lastCall?.[0]).toStrictEqual("test cmd");
    });

    it("emits a warning log if stderr without preventing stdout from being returned", async () => {
      const warnSpy = vi.spyOn(core, "warning");
      const execSpy = vi.spyOn(cp, "exec").mockImplementation(((
        _cmd: string,
        func: (error: any, stdout: string, stderr: string) => void,
      ) => {
        func(undefined, "stdout output", "stderr output");
      }) as any);

      const result = await run("test cmd");

      expect(warnSpy.mock.lastCall?.[0]).toStrictEqual("knip stderr:\nstderr output");
      expect(execSpy.mock.lastCall?.[0]).toStrictEqual("test cmd");
      expect(result).toStrictEqual("stdout output");
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

  describe("buildArraySectionWithAnnotations", () => {
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

    it("should transform a exports array section to markdown", () => {
      const section = buildArraySectionWithAnnotations("exports", exports, false, true);
      expect(section).toMatchSnapshot();
    });

    it("should transform a exports array section to markdown if verbose and annotations are disabled", () => {
      const section = buildArraySectionWithAnnotations("exports", exports, false, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a exports array section to annotations", () => {
      const section = buildArraySectionWithAnnotations("exports", exports, true, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a exports array section to markdown and annotations", () => {
      const section = buildArraySectionWithAnnotations("exports", exports, true, true);
      expect(section).toMatchSnapshot();
    });

    it("should transform a types array section to markdown", () => {
      const section = buildArraySectionWithAnnotations("types", types, false, true);
      expect(section).toMatchSnapshot();
    });

    it("should transform a types array section to markdown if verbose and annotations are disabled", () => {
      const section = buildArraySectionWithAnnotations("types", types, false, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a types array section to annotations", () => {
      const section = buildArraySectionWithAnnotations("types", types, true, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a types array section to markdown and annotations", () => {
      const section = buildArraySectionWithAnnotations("types", types, true, true);
      expect(section).toMatchSnapshot();
    });
  });

  describe("buildMapSection", () => {
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

    it("should transform a enumMembers map section to markdown", () => {
      const section = buildMapSection("enumMembers", enumMembers, false, true);
      expect(section).toMatchSnapshot();
    });

    it("should transform a enumMembers map section to markdown if verbose and annotations are disabled", () => {
      const section = buildMapSection("enumMembers", enumMembers, false, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a enumMembers map section to annotations", () => {
      const section = buildMapSection("enumMembers", enumMembers, true, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a enumMembers map section to markdown and annotations", () => {
      const section = buildMapSection("enumMembers", enumMembers, true, true);
      expect(section).toMatchSnapshot();
    });

    it("should transform a classMembers map section to markdown", () => {
      const section = buildMapSection("classMembers", classMembers, false, true);
      expect(section).toMatchSnapshot();
    });

    it("should transform a classMembers map section to markdown if verbose and annotations are disabled", () => {
      const section = buildMapSection("classMembers", classMembers, false, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a classMembers map section to annotations", () => {
      const section = buildMapSection("classMembers", classMembers, true, false);
      expect(section).toMatchSnapshot();
    });

    it("should transform a classMembers map section to markdown and annotations", () => {
      const section = buildMapSection("classMembers", classMembers, true, true);
      expect(section).toMatchSnapshot();
    });
  });

  describe("buildMarkdownSections", () => {
    it("outputs only sections", () => {
      const parsedReport = parseJsonReport(JSON.stringify(reportJson));
      const { sections, annotations } = buildMarkdownSections(parsedReport, false, true);

      expect(sections).toHaveLength(12);
      expect(annotations).toHaveLength(0);
      for (const section of sections) {
        expect(section).toBeTypeOf("string");
      }
      expect(sections).toMatchSnapshot();
    });

    it("outputs verbose sections and annotations", () => {
      const parsedReport = parseJsonReport(JSON.stringify(reportJson));
      const { sections, annotations } = buildMarkdownSections(parsedReport, true, true);

      expect(sections).toHaveLength(12);
      for (const section of sections) {
        expect(section).toBeTypeOf("string");
      }
      expect(sections).toMatchSnapshot();

      expect(annotations).toHaveLength(32);
      for (const annotation of annotations) {
        expect(annotation).toBeTypeOf("object");
      }
      expect(annotations).toMatchSnapshot();
    });

    it("outputs sections and annotations", () => {
      const parsedReport = parseJsonReport(JSON.stringify(reportJson));
      const { sections, annotations } = buildMarkdownSections(parsedReport, true, false);

      expect(sections).toHaveLength(7);
      for (const section of sections) {
        expect(section).toBeTypeOf("string");
      }
      expect(sections).toMatchSnapshot();

      expect(annotations).toHaveLength(32);
      for (const annotation of annotations) {
        expect(annotation).toBeTypeOf("object");
      }
      expect(annotations).toMatchSnapshot();
    });
  });

  describe("processSectionToMessage", () => {
    it("should return sections that are below the github max character limit", () => {
      const sectionHeader = "### Unused Enum Members (12)";
      const tableHeader = ["Filename", "Enum", "Member"];
      const src = [
        [
          "DrNefarious.ts",
          "Homeworld",
          "`Magmos`<br/>`Aquatos`<br/>`Leviathan `<br/>`TombliOutpost`<br/>`Zanifar `<br/>`NefariousSpaceStation `<br/>`NefariousCity`<br/>`CorsonV`",
        ],
        ["Sigmund.ts", "Membership", "`ZordoomPrison`<br/>`GreatClockStaff`"],
        ["Sigmund.ts", "Residence", "`Viceron`<br/>`GreatClock`"],
      ];
      const body: string[][] = [];
      for (let i = 0; i < 500; i++) {
        body.push(...src);
      }

      const messages = processSectionToMessages(sectionHeader, tableHeader, body);
      expect(messages).toMatchSnapshot();
    });
  });

  describe("getJsonFromOutput", () => {
    it("should get the report json from the command output", () => {
      /* eslint-disable no-irregular-whitespace */
      const cliOutput = `

> knip-reporter@0.0.0 knip /Users/x/dev/p/knip-reporter
> knip "--reporter" "json"

{"files":["foo.ts"],"issues":[{"foo":"bar"}]}

${JSON.stringify(reportJson)}
 ELIFECYCLE  Command failed with exit code 3.

`;
      /* eslint-enable no-irregular-whitespace */
      const jsonStr = getJsonFromOutput(cliOutput);
      expect(() => JSON.parse(jsonStr)).not.toThrow();
      const jsonObj = JSON.parse(jsonStr);
      expect(jsonObj).toBeTypeOf("object");
    });

    it("should throw if there isn't valid output", () => {
      /* eslint-disable no-irregular-whitespace */
      const cliOutput = `

> knip-reporter@0.0.0 knip /Users/x/dev/p/knip-reporter
> knip

Unused files (2)
src/tasks/check.ts
src/x.ts
 ELIFECYCLE  Command failed with exit code 2.
`;
      /* eslint-enable no-irregular-whitespace */
      expect(() => getJsonFromOutput(cliOutput)).toThrowError("Unable to find JSON blob");
    });
  });
});
