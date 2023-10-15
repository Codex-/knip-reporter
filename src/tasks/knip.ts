import { exec } from "node:child_process";

import * as core from "@actions/core";
import { parseNr, getCliCommand } from "@antfu/ni";
import { markdownTable } from "markdown-table";

import type { Task } from "./task.ts";

async function buildRunKnipCommand(buildScriptName: string): Promise<string> {
  const cmd = await getCliCommand(parseNr, [buildScriptName, "--reporter json"], {
    programmatic: true,
  });
  if (!cmd) {
    throw new Error("Unable to generate command for package manager");
  }

  return cmd;
}

async function run(runCmd: string): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    exec(runCmd, (_err, stdout, stderr) => {
      // Knip will exit with a non-zero code on there being results
      // We only reject the promise if there has been content written to stderr
      // Since knip having results will always gives an error exit status
      if (stderr.length > 0) {
        reject(stderr);
      }
      resolve(stdout);
    });
  });
  return result;
}

interface ParsedReport {
  /**
   * Unused files `files`
   */
  files: string[];

  /**
   * Unused dependencies `dependencies`
   */
  dependencies: Record<string, string[]>;

  /**
   * Unused devDependencies `devDependencies`
   */
  devDependencies: Record<string, string[]>;

  /**
   * Unused optionalPeerDependencies `optionalPeerDependencies`
   */
  optionalPeerDependencies: Record<string, string[]>;

  /**
   * Unlisted dependencies `unlisted`
   */
  unlisted: Record<string, string[]>;

  /**
   * Unlisted binaries `binaries`
   */
  binaries: Record<string, string[]>;

  /**
   * Unresolved imports `unresolved`
   */
  unresolved: Record<string, string[]>;

  /**
   * Unused exports and unused namespaces exports`exports`
   */
  exports: Record<string, string[]>;

  /**
   * Unused exported types and unused namespace types `types`
   */
  types: Record<string, string[]>;

  /**
   * Unused exported enum members `enumMembers`
   */
  enumMembers: Record<string, Record<string, string[]>>;

  /**
   * Unused exported class members `classMembers`
   */
  classMembers: Record<string, Record<string, string[]>>;

  /**
   * Duplicate exports `duplicates`
   */
  duplicates: Record<string, string[]>;
}

function parseJsonReport(rawJson: string): ParsedReport {
  // Default JSON reporter results in a collection with a single object
  const entries = JSON.parse(rawJson);
  const out: ParsedReport = {
    files: [],
    dependencies: {},
    devDependencies: {},
    optionalPeerDependencies: {},
    unlisted: {},
    binaries: {},
    unresolved: {},
    exports: {},
    types: {},
    enumMembers: {},
    classMembers: {},
    duplicates: {},
  };

  for (const entry of entries) {
    const fileName: string = entry.file;

    for (const [type, result] of Object.entries(entry)) {
      if (result === undefined || result === null) {
        continue;
      }

      switch (type) {
        case "files":
          if (result === true) {
            out.files.push(fileName);
          }
          break;
        case "dependencies":
        case "devDependencies":
        case "optionalPeerDependencies":
        case "unlisted":
        case "unresolved":
        case "exports":
        case "types":
        case "duplicates":
          if (Array.isArray(result) && result.length > 0) {
            out[type][fileName] = result;
          }
          break;
        case "enumMembers":
        case "classMembers":
          if (typeof result === "object" && Object.keys(result).length > 0) {
            out[type][fileName] = result as Record<string, string[]>;
          }
      }
    }
  }

  return out;
}

function buildFilesSection(files: string[]): string {
  const header = `### Unused files (${files.length})`;
  const body = files.map((file) => `\`${file}\``).join(", ");
  return header + "\n\n" + body;
}

/**
 * Build a section where the result is a collection of strings
 */
function buildArraySection(name: string, rawResults: Record<string, string[]>): string {
  let totalUnused = 0;
  const body = [["Filename", name]];
  for (const [fileName, results] of Object.entries(rawResults)) {
    totalUnused += results.length;
    body.push([fileName, results.map((result) => `\`${result}\``).join("<br/>")]);
  }
  const header = `### Unused ${name.toLocaleLowerCase()} (${totalUnused})`;

  return header + "\n\n" + markdownTable(body);
}

/**
 * Build a section where the result is a ma
 */
function buildMapSection(name: string, rawResults: Record<string, Record<string, string[]>>) {
  let totalUnused = 0;
  const body = [["Filename", name === "classMembers" ? "Class" : "Enum", "Member"]];

  for (const [filename, results] of Object.entries(rawResults)) {
    for (const [definitionName, members] of Object.entries(results)) {
      totalUnused += members.length;
      body.push([filename, definitionName, members.map((member) => `\`${member}\``).join("<br/>")]);
    }
  }

  const headerName = name === "classMembers" ? "Class Members" : "Enum Members";
  const header = `### Unused ${headerName} (${totalUnused})`;

  return header + "\n\n" + markdownTable([]);
}

function nextReport(report: ParsedReport): string {
  const output: string[] = [];
  for (const key of Object.keys(report)) {
    switch (key) {
      case "files":
        if (report.files.length > 0) {
          output.push(buildFilesSection(report.files));
        }
        break;
      case "dependencies":
      case "devDependencies":
      case "optionalPeerDependencies":
      case "unlisted":
      case "binaries":
      case "unresolved":
      case "exports":
      case "types":
      case "duplicates":
        if (Object.keys(report[key]).length > 0) {
          output.push(buildArraySection(key, report[key]));
        }
        break;
      case "enumMembers":
      case "classMembers":
        if (Object.keys(report[key]).length > 0) {
          output.push(buildMapSection(key, report[key]));
        }
        break;
    }
  }

  const x = output.join("\n\n");
  core.info(x);
  return x;
}

/**
 * Knip in some cases can end up causing javascript on
 * config files to evaluate. This means that if the consumer
 * outputs logs or information that could be misinterpreted as the
 * report.
 *
 * For now, we naively assume that the last entry of the output to begin
 * with '[' is the correct report
 */
function getJsonFromOutput(output: string): string {
  const lines = output.split(/\n/).reverse();
  for (const line of lines) {
    if (line.startsWith("[")) {
      return line;
    }
  }

  throw new Error("Unable to find JSON blob");
}

export function buildTask(buildScriptName: string) {
  return {
    name: "Knip",
    steps: [
      {
        name: "Build knip command",
        action: () => buildRunKnipCommand(buildScriptName),
      },
      {
        name: "Run knip",
        action: async (cmd: string) => getJsonFromOutput(await run(cmd)),
      },
      {
        name: "Parse knip report",
        action: (output: string) => parseJsonReport(output),
      },
      {
        name: "Convert report to markdown",
        action: (report: ParsedReport) => nextReport(report),
      },
    ] as const,
  } satisfies Task;
}
