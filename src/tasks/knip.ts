import { exec } from "node:child_process";

import * as core from "@actions/core";
import { parseNr, getCliCommand } from "@antfu/ni";
import { markdownTable, type Options as MarkdownTableOptions } from "markdown-table";

import { GITHUB_COMMENT_MAX_COMMENT_LENGTH } from "../api.ts";
import { timeTask } from "./task.ts";

async function buildRunKnipCommand(
  buildScriptName: string,
  annotationsEnabled: boolean,
): Promise<string> {
  const reporterArg = annotationsEnabled ? "--reporter jsonExt" : "--reporter json";
  const cmd = await getCliCommand(parseNr, [buildScriptName, reporterArg], {
    programmatic: true,
  });
  if (!cmd) {
    throw new Error("Unable to generate command for package manager");
  }

  core.debug(`knip command: ${cmd}`);

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
  const summary: Partial<Record<keyof ParsedReport, number>> = {};

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
            if (summary.files === undefined) {
              summary.files = 0;
            }
            summary.files++;
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
            if (summary[type] === undefined) {
              summary[type] = 0;
            }
            summary[type]! += result.length;
          }
          break;
        case "enumMembers":
        case "classMembers":
          if (typeof result === "object" && Object.keys(result).length > 0) {
            out[type][fileName] = result as Record<string, string[]>;
            if (summary[type] === undefined) {
              summary[type] = 0;
            }
            summary[type]! += Object.keys(result).length;
          }
      }
    }
  }

  core.debug(
    `[parseJsonReport]: results summary: {${Object.entries(summary)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ")}}`,
  );
  return out;
}

function buildFilesSection(files: string[]): string {
  const header = `### Unused files (${files.length})`;
  const body = files.map((file) => `\`${file}\``).join(", ");
  return header + "\n\n" + body;
}

function buildSectionName(name: string): string {
  switch (name) {
    case "dependencies":
    case "devDependencies":
    case "optionalPeerDependencies":
    case "exports":
    case "types":
      return `Unused ${name}`;
    case "unresolved":
      return "Unresolved imports";
    case "binaries":
      return "Unlisted binaries";
    case "unlisted":
      return "Unlisted dependencies";
    case "duplicates":
      return "Duplicates";
    default:
      throw new Error(`Unknown name: ${name}`);
  }
}

/**
 * Build a section where the result is a collection of strings
 */
function buildArraySection(name: string, rawResults: Record<string, string[]>): string[] {
  let totalUnused = 0;
  const tableHeader = ["Filename", name];
  const tableBody = [];
  for (const [fileName, results] of Object.entries(rawResults)) {
    totalUnused += results.length;
    tableBody.push([fileName, results.map((result) => `\`${result}\``).join("<br/>")]);
  }
  const sectionHeader = `### ${buildSectionName(name)} (${totalUnused})`;

  return processSectionToMessage(sectionHeader, tableHeader, tableBody);
}

/**
 * Build a section where the result is a ma
 */
function buildMapSection(
  name: string,
  rawResults: Record<string, Record<string, string[]>>,
): string[] {
  let totalUnused = 0;
  const tableHeader = ["Filename", name === "classMembers" ? "Class" : "Enum", "Member"];
  const tableBody = [];

  for (const [filename, results] of Object.entries(rawResults)) {
    for (const [definitionName, members] of Object.entries(results)) {
      totalUnused += members.length;
      tableBody.push([
        filename,
        definitionName,
        members.map((member) => `\`${member}\``).join("<br/>"),
      ]);
    }
  }

  const sectionHeaderName = name === "classMembers" ? "Class Members" : "Enum Members";
  const sectionHeader = `### Unused ${sectionHeaderName} (${totalUnused})`;

  return processSectionToMessage(sectionHeader, tableHeader, tableBody);
}

const markdownTableOptions: MarkdownTableOptions = {
  alignDelimiters: false,
  padding: false,
};

function processSectionToMessage(
  sectionHeader: string,
  tableHeader: string[],
  tableBody: string[][],
): string[] {
  const sectionProcessingMs = Date.now();
  let output = [
    sectionHeader + "\n\n" + markdownTable([tableHeader, ...tableBody], markdownTableOptions),
  ];
  const originalOutputLength = output[0]!.length;
  if (originalOutputLength < GITHUB_COMMENT_MAX_COMMENT_LENGTH) {
    // Output doesn't violate the limit, simply return and move on
    return output;
  }

  core.info(`    - Splitting section ${sectionHeader}`);
  output = [];

  // We round this number up otherwise the splitLength will result in exactly 65535-100
  // Adding 100 to the limit to give us a bit of wiggle room when splitting the section
  const splitFactor = Math.ceil(originalOutputLength / (GITHUB_COMMENT_MAX_COMMENT_LENGTH + 100));
  const tableBodySize = tableBody.length;
  const tableBodySplitSize = Math.ceil(tableBodySize / splitFactor);
  const tableBodyItemWindow = Math.ceil(tableBodySize / tableBodySplitSize);
  let tableBodySliceStart = 0;
  let tableBodySliceEnd = tableBodyItemWindow;
  while (tableBodySliceStart < tableBodySize) {
    const slicedBodyItems = tableBody.slice(tableBodySliceStart, tableBodySliceEnd);
    if (slicedBodyItems.length === 0) {
      break;
    }
    const markdown = markdownTable([tableHeader, ...slicedBodyItems], markdownTableOptions);
    const newSection = sectionHeader + "\n\n" + markdown;
    output.push(newSection);

    tableBodySliceStart = tableBodySliceEnd;
    tableBodySliceEnd += tableBodyItemWindow;
  }

  core.info(`    ✔ Splitting section ${sectionHeader} (${Date.now() - sectionProcessingMs}ms)`);
  return output;
}

function buildMarkdownSections(report: ParsedReport): string[] {
  const output: string[] = [];
  for (const key of Object.keys(report)) {
    switch (key) {
      case "files":
        if (report.files.length > 0) {
          output.push(buildFilesSection(report.files));
          core.debug(`[buildMarkdownSections]: Parsed ${key} (${report.files.length})`);
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
          for (const section of buildArraySection(key, report[key])) {
            output.push(section);
          }
          core.debug(`[buildMarkdownSections]: Parsed ${key} (${Object.keys(report[key]).length})`);
        }
        break;
      case "enumMembers":
      case "classMembers":
        if (Object.keys(report[key]).length > 0) {
          for (const section of buildMapSection(key, report[key])) {
            output.push(section);
          }
          core.debug(`[buildMarkdownSections]: Parsed ${key} (${Object.keys(report[key]).length})`);
        }
        break;
    }
  }

  return output;
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

export async function runKnipTasks(
  buildScriptName: string,
  annotationsEnabled: boolean,
): Promise<string[]> {
  const taskMs = Date.now();
  core.info("- Running Knip tasks");

  const cmd = await timeTask("Build knip command", () =>
    buildRunKnipCommand(buildScriptName, annotationsEnabled),
  );
  const output = await timeTask("Run knip", async () => getJsonFromOutput(await run(cmd)));
  const report = await timeTask("Parse knip report", async () => parseJsonReport(output));
  const sections = await timeTask("Convert report to markdown", async () =>
    buildMarkdownSections(report),
  );

  core.info(`✔ Running Knip tasks (${Date.now() - taskMs}ms)`);
  return sections;
}
