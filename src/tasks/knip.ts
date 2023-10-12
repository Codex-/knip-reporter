import { exec } from "node:child_process";

import { parseNr, getCliCommand } from "@antfu/ni";

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
    ] as const,
  } satisfies Task;
}
