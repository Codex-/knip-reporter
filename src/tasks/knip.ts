import { exec } from "node:child_process";

import * as core from "@actions/core";
import { parseNr, getCliCommand } from "@antfu/ni";
import { markdownTable, type Options as MarkdownTableOptions } from "markdown-table";

import { GITHUB_COMMENT_MAX_COMMENT_LENGTH } from "../api.ts";
import { timeTask } from "./task.ts";
import type { ItemMeta } from "./types.ts";

export async function buildRunKnipCommand(buildScriptName: string): Promise<string> {
  const cmd = await getCliCommand(parseNr, [buildScriptName, "--reporter jsonExt"], {
    programmatic: true,
  });
  if (!cmd) {
    throw new Error("Unable to generate command for package manager");
  }

  core.debug(`knip command: ${cmd}`);

  return cmd;
}

export async function run(runCmd: string): Promise<string> {
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

type Item = { name: string; pos?: number; line?: number; col?: number };

interface ParsedReport {
  /**
   * Unused files `files`
   */
  files: string[];

  /**
   * Unused dependencies `dependencies`
   */
  dependencies: Record<string, Array<{ name: string }>>;

  /**
   * Unused devDependencies `devDependencies`
   */
  devDependencies: Record<string, Array<{ name: string }>>;

  /**
   * Unused optionalPeerDependencies `optionalPeerDependencies`
   */
  optionalPeerDependencies: Record<string, Array<{ name: string }>>;

  /**
   * Unlisted dependencies `unlisted`
   */
  unlisted: Record<string, Array<{ name: string }>>;

  /**
   * Unlisted binaries `binaries`
   */
  binaries: Record<string, Array<{ name: string }>>;

  /**
   * Unresolved imports `unresolved`
   */
  unresolved: Record<string, Array<{ name: string }>>;

  /**
   * Unused exports and unused namespaces exports`exports`
   */
  exports: Record<string, Item[]>;

  /**
   * Unused exported types and unused namespace types `types`
   */
  types: Record<string, Item[]>;

  /**
   * Unused exported enum members `enumMembers`
   */
  enumMembers: Record<string, Record<string, Item[]>>;

  /**
   * Unused exported class members `classMembers`
   */
  classMembers: Record<string, Record<string, Item[]>>;

  /**
   * Duplicate exports `duplicates`
   */
  duplicates: Record<string, Array<Item[]>>;
}

export function parseJsonReport(rawJson: string): ParsedReport {
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
        case "binaries":
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
            out[type][fileName] = result as Record<string, Item[]>;
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

export function buildFilesSection(files: string[]): string {
  const header = `### Unused files (${files.length})`;
  const body = files.map((file) => `\`${file}\``).join(", ");
  return header + "\n\n" + body;
}

export function buildSectionName(name: string): string {
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
export function buildArraySection(
  name: string,
  rawResults: Record<string, Item[] | Item[][]>,
): string[] {
  let totalUnused = 0;
  const tableHeader = ["Filename", name];
  const tableBody = [];

  for (const [fileName, results] of Object.entries(rawResults)) {
    totalUnused += results.length;
    tableBody.push([
      fileName,
      results
        .map((result) => {
          if (Array.isArray(result)) {
            return result.map((item) => `\`${item.name}\``).join(", ");
          }
          return `\`${result.name}\``;
        })
        .join("<br/>"),
    ]);
  }

  const sectionHeader = `### ${buildSectionName(name)} (${totalUnused})`;

  return processSectionToMessages(sectionHeader, tableHeader, tableBody);
}

function isValidAnnotationBody(item: Omit<Item, "name">): item is Required<Omit<Item, "name">> {
  return item.pos !== undefined && item.line !== undefined && item.col !== undefined;
}

/**
 * Build a section where the result is a map
 *
 * As these sections are the only sections that return code identifiers
 * we process the sections and annotations.
 *
 * @returns a tuple of the markdown sections if verbose and annotations if enabled
 */
export function buildMapSection(
  name: string,
  rawResults: Record<string, Record<string, Item[]>>,
  annotationsEnabled: boolean,
  verboseEnabled: boolean,
): { sections: string[]; annotations: ItemMeta[] } {
  let totalUnused = 0;
  const tableBody: string[][] = [];
  const annotations: ItemMeta[] = [];
  const resultType = name === "classMembers" ? "Class" : "Enum";
  const resultMetaType = name === "classMembers" ? "class" : "enum";

  for (const [filename, results] of Object.entries(rawResults)) {
    for (const [definitionName, members] of Object.entries(results)) {
      const itemNames = [];
      for (const member of members) {
        if (annotationsEnabled && isValidAnnotationBody(member)) {
          annotations.push({
            path: filename,
            identifier: member.name,
            start_line: member.line,
            start_column: member.col,
            type: resultMetaType,
          });
        }
        if (verboseEnabled) {
          itemNames.push(`\`${member.name}\``);
        }
      }
      totalUnused += members.length;
      if (verboseEnabled) {
        tableBody.push([filename, definitionName, itemNames.join("<br/>")]);
      }
    }
  }

  if (verboseEnabled) {
    const tableHeader = ["Filename", resultType, "Member"];
    const sectionHeaderName = `${resultType} Members`;
    const sectionHeader = `### Unused ${sectionHeaderName} (${totalUnused})`;
    const processedSections = processSectionToMessages(sectionHeader, tableHeader, tableBody);

    return { sections: processedSections, annotations: annotations };
  }

  return { sections: [], annotations: annotations };
}

export function processSectionToMessages(
  sectionHeader: string,
  tableHeader: string[],
  tableBody: string[][],
): string[] {
  const markdownTableOptions: MarkdownTableOptions = {
    alignDelimiters: false,
    padding: false,
  };

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

export function buildMarkdownSections(
  report: ParsedReport,
  annotationsEnabled: boolean,
  verboseEnabled: boolean,
): { sections: string[]; annotations: ItemMeta[] } {
  const outputAnnotations: ItemMeta[] = [];
  const outputSections: string[] = [];
  for (const key of Object.keys(report)) {
    switch (key) {
      case "files":
        if (report.files.length > 0) {
          outputSections.push(buildFilesSection(report.files));
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
            outputSections.push(section);
          }
          core.debug(`[buildMarkdownSections]: Parsed ${key} (${Object.keys(report[key]).length})`);
        }
        break;
      case "enumMembers":
      case "classMembers":
        if (Object.keys(report[key]).length > 0) {
          const { sections, annotations } = buildMapSection(
            key,
            report[key],
            annotationsEnabled,
            verboseEnabled,
          );
          outputAnnotations.push(...annotations);
          for (const section of sections) {
            outputSections.push(section);
          }
          core.debug(`[buildMarkdownSections]: Parsed ${key} (${Object.keys(report[key]).length})`);
        }
        break;
    }
  }

  return { sections: outputSections, annotations: outputAnnotations };
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
export function getJsonFromOutput(output: string): string {
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
  verboseEnabled: boolean,
): Promise<{ sections: string[]; annotations: ItemMeta[] }> {
  const taskMs = Date.now();
  core.info("- Running Knip tasks");

  const cmd = await timeTask("Build knip command", () => buildRunKnipCommand(buildScriptName));
  const output = await timeTask("Run knip", async () => getJsonFromOutput(await run(cmd)));
  const report = await timeTask("Parse knip report", async () => parseJsonReport(output));
  const sectionsAndAnnotations = await timeTask("Convert report to markdown", async () =>
    buildMarkdownSections(report, annotationsEnabled, verboseEnabled),
  );

  core.info(`✔ Running Knip tasks (${Date.now() - taskMs}ms)`);
  return sectionsAndAnnotations;
}
