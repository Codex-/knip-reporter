import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import * as core from "@actions/core";
import { parseNr, getCliCommand } from "@antfu/ni";
import { markdownTable, type Options as MarkdownTableOptions } from "markdown-table";

import { COMMENT_SECTION_BUDGET } from "./comment.ts";
import { timeTask } from "./task.ts";
import type { CollapseSections, ItemMeta } from "./types.ts";

/**
 * Build the shell command that runs the knip script.
 *
 * The package manager and the script come from the process working directory
 * (the repository root in a workflow). `cwd` only changes the directory knip
 * analyses, via `--directory`, and is quoted since the command runs in a shell.
 */
export async function buildRunKnipCommand(buildScriptName: string, cwd?: string): Promise<string> {
  const knipArgs = [buildScriptName, "--reporter json"];
  if (cwd) {
    // Double quotes work in both sh and cmd.exe, so this covers every runner OS.
    knipArgs.push(`--directory "${cwd.replaceAll('"', '\\"')}"`);
  }
  const cmd = await getCliCommand(parseNr, knipArgs, {
    programmatic: true,
  });
  if (!cmd) {
    throw new Error("Unable to generate command for package manager");
  }
  const command = `${cmd.command} ${cmd.args.join(" ")}`;
  core.debug(`[buildRunKnipCommand] command: '${command}'`);

  return command;
}

export interface RunResult {
  stdout: string;

  /**
   * Undefined when the process exited normally with code 0.
   */
  exitCode: number | undefined;
}

/**
 * Run the knip command and capture its output.
 *
 * Resolves on any exit code, since knip exits non-zero whenever it has
 * findings. Rejects only when the process could not run to completion.
 */
export function run(runCmd: string): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    // The default 1 MiB maxBuffer kills the process and truncates stdout,
    // which a large JSON report can easily exceed.
    exec(runCmd, { maxBuffer: Infinity }, (error, stdout, stderr) => {
      // Knip having results always gives an error exit code, so stderr
      // content is only worth a warning.
      if (stderr.length > 0) {
        core.warning("knip stderr:\n" + stderr);
      }

      // A string code (e.g. ENOENT) or a signal means the process never ran
      // to completion, so its output cannot be trusted.
      if (error && (typeof error.code === "string" || error.signal)) {
        reject(new Error(`Failed to run knip: ${error.message}`, { cause: error }));
        return;
      }

      resolve({ stdout, exitCode: error?.code });
    });
  });
}

interface Item {
  name: string;
  pos?: number;
  line?: number;
  col?: number;
}

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
   * Duplicate exports `duplicates`
   */
  duplicates: Record<string, Item[][]>;

  /**
   * Unused exported enum members `enumMembers`
   */
  enumMembers: Record<string, Record<string, Item[]>>;

  /**
   * Unused namespace members (class methods, TS namespaces) `namespaceMembers`
   */
  namespaceMembers: Record<string, Record<string, Item[]>>;
}
type ParsedReportKey = keyof ParsedReport;

interface UnknownIssue {
  file: string;
}

/**
 * Walk an already-parsed JSON report into the per-type maps.
 *
 * Takes the parsed value rather than the text so the report is parsed once,
 * where it was read, and not again here.
 */
export function parseJsonReport(report: unknown): ParsedReport {
  // Default JSON reporter no longer has a top-level `files` key.
  // Unused files now appear as `Row.files: Item[]` per row, and enum/namespace
  // members are flat `Item[]` with the enum/namespace name in `Item.namespace`.
  const parsed = report as { issues?: UnknownIssue[] } | null;
  const { issues = [] } = parsed ?? {};
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
    duplicates: {},
    enumMembers: {},
    namespaceMembers: {},
  };
  const summary: Partial<Record<ParsedReportKey, number>> = {};

  for (const issue of issues) {
    const fileName: string = issue.file;

    for (const [type, result] of Object.entries(issue)) {
      if (result === undefined || result === null) {
        continue;
      }

      switch (type) {
        case "files":
          if (Array.isArray(result) && result.length > 0) {
            for (const item of result as Array<{ name: string }>) {
              if (item.name) {
                out.files.push(item.name);
                summary.files = (summary.files ?? 0) + 1;
              }
            }
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
            out[type][fileName] = result as ParsedReport[typeof type][string];
            summary[type] ??= 0;
            summary[type] += result.length;
          }
          break;
        case "enumMembers":
        case "namespaceMembers":
          if (Array.isArray(result) && result.length > 0) {
            const grouped: Record<string, Item[]> = {};
            for (const item of result as Array<Item & { namespace?: string }>) {
              const ns = item.namespace ?? "";
              grouped[ns] ??= [];
              grouped[ns].push(item);
            }
            out[type][fileName] = grouped;
            summary[type] ??= 0;
            summary[type] += Object.keys(grouped).length;
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

export function buildFilesSection(files: string[], collapse: CollapseSections): string[] {
  const sectionHeader = `### Unused files (${files.length})`;
  return splitRowsToMessages(sectionHeader, files, (rows, chunkIndex, chunkCount) =>
    buildSectionMessage(
      sectionHeader,
      files.length,
      rows.map((file) => `- ${codeSpan(file)}`).join("\n"),
      chunkIndex,
      chunkCount,
      collapse,
    ),
  );
}

/**
 * Render a value as an inline code span.
 *
 * The delimiter has to be longer than any backtick run in the value,
 * otherwise the run would close the span early.
 */
function codeSpan(value: string): string {
  const backtickRuns = value.match(/`+/g);
  if (backtickRuns === null) {
    return `\`${value}\``;
  }
  const longestRun = Math.max(...backtickRuns.map((ticks) => ticks.length));
  const delimiter = "`".repeat(longestRun + 1);
  // The padding spaces keep a leading or trailing backtick out of the delimiter.
  return `${delimiter} ${value} ${delimiter}`;
}

/**
 * Render a value as a code span in a markdown table cell.
 *
 * GitHub flavoured markdown splits a row on `|` even inside a code
 * span, so a pipe in a path or identifier has to be escaped to keep
 * the row intact.
 */
function codeCell(value: string): string {
  return codeSpan(value.replaceAll("|", "\\|"));
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
      throw new TypeError(`Unknown name: ${name}`);
  }
}

/**
 * Build a section where the result is a collection of strings
 */
export function buildArraySection(
  name: string,
  rawResults: Record<string, Item[] | Item[][]>,
  collapse: CollapseSections,
): string[] {
  let totalUnused = 0;
  const tableHeader = ["Filename", name];
  const tableBody = [];

  for (const [fileName, results] of Object.entries(rawResults)) {
    totalUnused += results.length;
    tableBody.push([
      codeCell(fileName),
      results
        .map((result) => {
          if (Array.isArray(result)) {
            return result.map((item) => codeCell(item.name)).join(", ");
          }
          return codeCell(result.name);
        })
        .join("<br/>"),
    ]);
  }

  const sectionHeader = `### ${buildSectionName(name)} (${totalUnused})`;

  return processSectionToMessages(sectionHeader, totalUnused, tableHeader, tableBody, collapse);
}

function getMetaType(type: ParsedReportKey): ItemMeta["type"] {
  switch (type) {
    case "namespaceMembers":
      return "namespace";
    case "enumMembers":
      return "enum";
    case "exports":
      return "export";
    case "types":
      return "type";
    case "duplicates":
      return "duplicate";
    default:
      throw new TypeError(`Unhandled meta type: ${type}`);
  }
}

/**
 * Build a section where the result is a collection and supports annotations
 *
 * @returns a tuple of the markdown sections if verbose and annotations if enabled
 */
export function buildArraySectionWithAnnotations(
  name: ParsedReportKey,
  rawResults: Record<string, Item[] | Item[][]>,
  annotationsEnabled: boolean,
  verboseEnabled: boolean,
  collapse: CollapseSections,
): { sections: string[]; annotations: ItemMeta[] } {
  const tableBody: string[][] = [];
  const annotations: ItemMeta[] = [];
  const shouldBuildMarkdown = verboseEnabled || !annotationsEnabled;
  const metaType = getMetaType(name);

  let totalUnused = 0;
  for (const [filename, results] of Object.entries(rawResults)) {
    const itemNames = [];
    for (const item of results) {
      // Handle the duplicates case
      if (Array.isArray(item)) {
        for (let i = 0; i < item.length; i++) {
          const duplicate = item[i];
          if (!duplicate) {
            continue;
          }

          const otherDuplicates = [...item.slice(0, i), ...item.slice(i + 1, item.length)].map(
            (dupe) => dupe.name,
          );

          if (annotationsEnabled && isValidAnnotationBody(duplicate)) {
            annotations.push({
              path: filename,
              identifier: duplicate.name,
              start_line: duplicate.line,
              start_column: duplicate.col,
              type: "duplicate",
              duplicateIdentifiers: otherDuplicates,
            });
          }
        }
        if (shouldBuildMarkdown) {
          itemNames.push(item.map((dup) => codeCell(dup.name)).join(", "));
        }
        totalUnused += item.length;
        continue;
      }

      if (annotationsEnabled && isValidAnnotationBody(item)) {
        annotations.push({
          path: filename,
          identifier: item.name,
          start_line: item.line,
          start_column: item.col,
          type: metaType as Exclude<ItemMeta["type"], "duplicate">,
        });
      }
      if (shouldBuildMarkdown) {
        itemNames.push(codeCell(item.name));
      }
      totalUnused++;
    }
    if (shouldBuildMarkdown) {
      tableBody.push([codeCell(filename), itemNames.join("<br/>")]);
    }
  }

  if (shouldBuildMarkdown) {
    const tableHeader = ["Filename", name];
    const sectionHeader = `### ${buildSectionName(name)} (${totalUnused})`;
    const processedSections = processSectionToMessages(
      sectionHeader,
      totalUnused,
      tableHeader,
      tableBody,
      collapse,
    );

    return { sections: processedSections, annotations: annotations };
  }

  return { sections: [], annotations: annotations };
}

type Positioned = Required<Pick<Item, "line" | "col">>;

/**
 * An annotation needs a line and column. `pos` is a byte offset the Checks
 * API has no use for, so it must not gate an otherwise-positioned item.
 */
function isValidAnnotationBody(item: Omit<Item, "name">): item is Omit<Item, "name"> & Positioned {
  return item.line !== undefined && item.col !== undefined;
}

/**
 * Build a section where the result is a map
 *
 * @returns a tuple of the markdown sections if verbose and annotations if enabled
 */
export function buildMapSection(
  name: ParsedReportKey,
  rawResults: Record<string, Record<string, Item[]>>,
  annotationsEnabled: boolean,
  verboseEnabled: boolean,
  collapse: CollapseSections,
): { sections: string[]; annotations: ItemMeta[] } {
  const tableBody: string[][] = [];
  const annotations: ItemMeta[] = [];
  const shouldBuildMarkdown = verboseEnabled || !annotationsEnabled;
  const metaType = getMetaType(name) as "namespace" | "enum";
  const resultType = metaType.charAt(0).toUpperCase() + metaType.slice(1);

  let totalUnused = 0;
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
            type: metaType,
          });
        }
        if (shouldBuildMarkdown) {
          itemNames.push(codeCell(member.name));
        }
      }
      totalUnused += members.length;
      if (shouldBuildMarkdown) {
        tableBody.push([codeCell(filename), codeCell(definitionName), itemNames.join("<br/>")]);
      }
    }
  }

  if (shouldBuildMarkdown) {
    const tableHeader = ["Filename", resultType, "Member"];
    const sectionHeaderName = `${resultType} Members`;
    const sectionHeader = `### Unused ${sectionHeaderName} (${totalUnused})`;
    const processedSections = processSectionToMessages(
      sectionHeader,
      totalUnused,
      tableHeader,
      tableBody,
      collapse,
    );

    return { sections: processedSections, annotations: annotations };
  }

  return { sections: [], annotations: annotations };
}

function chunkRows<Row>(rows: Row[], rowsPerChunk: number): Row[][] {
  const chunks: Row[][] = [];
  for (let start = 0; start < rows.length; start += rowsPerChunk) {
    chunks.push(rows.slice(start, start + rowsPerChunk));
  }
  return chunks;
}

/**
 * Split a section's rows across as many messages as needed to keep each one
 * within the section budget, leaving room for the comment preamble.
 *
 * `render` must return the complete message for a slice of rows so that the
 * header and any surrounding markup count toward the limit. A single row that
 * cannot fit on its own is still returned oversized, leaving the caller to
 * report it.
 */
function splitRowsToMessages<Row>(
  sectionHeader: string,
  rows: Row[],
  render: (rows: Row[], chunkIndex: number, chunkCount: number) => string,
): string[] {
  let messages = [render(rows, 0, 1)];
  if ((messages[0]?.length ?? 0) < COMMENT_SECTION_BUDGET) {
    // Output doesn't violate the limit, simply return and move on
    return messages;
  }

  const sectionProcessingMs = Date.now();
  core.info(`    - Splitting section ${sectionHeader}`);

  // Message overhead is only known once rendered, so start from an estimate
  // and shrink the chunk size by the observed overflow until every chunk fits.
  const estimatedChunks = Math.max(
    2,
    Math.ceil((messages[0]?.length ?? 0) / COMMENT_SECTION_BUDGET),
  );
  let rowsPerChunk = Math.ceil(rows.length / estimatedChunks);
  let done = false;
  while (!done) {
    const chunks = chunkRows(rows, rowsPerChunk);
    messages = chunks.map((chunk, index) => render(chunk, index, chunks.length));
    let longest = 0;
    for (const message of messages) {
      longest = Math.max(longest, message.length);
    }
    // At one row per chunk, oversized messages are left for the caller to report.
    done = longest < COMMENT_SECTION_BUDGET || rowsPerChunk === 1;
    if (!done) {
      // Shrink by the overflow ratio, and by at least one row to terminate.
      rowsPerChunk = Math.max(
        1,
        Math.min(rowsPerChunk - 1, Math.floor((rowsPerChunk * COMMENT_SECTION_BUDGET) / longest)),
      );
    }
  }

  core.info(`    ✔ Splitting section ${sectionHeader} (${Date.now() - sectionProcessingMs}ms)`);
  return messages;
}

const MARKDOWN_TABLE_OPTIONS: MarkdownTableOptions = {
  alignDelimiters: false,
  padding: false,
};

/**
 * Sections this small read fine inline, so collapsing them costs a click and
 * gains nothing.
 */
const COLLAPSE_RESULT_THRESHOLD = 10;

/**
 * Assemble one message for a section, collapsing the body behind a `<details>`
 * block when the section is large enough to be worth hiding.
 *
 * `resultCount` is the section total rather than this message's share of it,
 * so a split section is labelled with the part it holds.
 */
function buildSectionMessage(
  sectionHeader: string,
  resultCount: number,
  body: string,
  chunkIndex: number,
  chunkCount: number,
  collapse: CollapseSections,
): string {
  const shouldCollapse =
    collapse === "always" || (collapse === "auto" && resultCount > COLLAPSE_RESULT_THRESHOLD);
  const part = chunkCount > 1 ? ` (part ${chunkIndex + 1} of ${chunkCount})` : "";
  if (!shouldCollapse) {
    // Without a details block the part label goes on the header, otherwise
    // split chunks render as indistinguishable repeats of the same section.
    return `${sectionHeader}${part}\n\n${body}`;
  }

  const summary = `View <b>${resultCount}</b> results${part}`;
  // Blank lines around the body are required for GitHub to render markdown
  // nested inside the HTML block.
  return `${sectionHeader}\n\n<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

export function processSectionToMessages(
  sectionHeader: string,
  resultCount: number,
  tableHeader: string[],
  tableBody: string[][],
  collapse: CollapseSections,
): string[] {
  return splitRowsToMessages(sectionHeader, tableBody, (rows, chunkIndex, chunkCount) =>
    buildSectionMessage(
      sectionHeader,
      resultCount,
      markdownTable([tableHeader, ...rows], MARKDOWN_TABLE_OPTIONS),
      chunkIndex,
      chunkCount,
      collapse,
    ),
  );
}

export function buildMarkdownSections(
  report: ParsedReport,
  annotationsEnabled: boolean,
  verboseEnabled: boolean,
  collapse: CollapseSections,
): { sections: string[]; annotations: ItemMeta[] } {
  const outputAnnotations: ItemMeta[] = [];
  const outputSections: string[] = [];
  for (const key of Object.keys(report) as Array<keyof ParsedReport>) {
    const value = report[key];

    let buildWithAnnotations:
      | (() => {
          sections: string[];
          annotations: ItemMeta[];
        })
      | undefined = undefined;
    let length = 0;

    if (key === "files") {
      if (report.files.length > 0) {
        outputSections.push(...buildFilesSection(report.files, collapse));
        core.debug(`[buildMarkdownSections]: Parsed ${key} (${report.files.length})`);
      }
      continue;
    }

    if (Object.keys(value).length <= 0) {
      continue;
    }

    switch (key) {
      case "dependencies":
      case "devDependencies":
      case "optionalPeerDependencies":
      case "unlisted":
      case "binaries":
      case "unresolved": {
        const sections = buildArraySection(
          key,
          value as Parameters<typeof buildArraySection>[1],
          collapse,
        );
        outputSections.push(...sections);
        core.debug(`[buildArraySections]: Parsed ${key} (${Object.keys(value).length})`);
        break;
      }
      case "exports":
      case "types":
      case "duplicates":
        buildWithAnnotations = (): ReturnType<typeof buildArraySectionWithAnnotations> =>
          buildArraySectionWithAnnotations(
            key,
            value as Parameters<typeof buildArraySectionWithAnnotations>[1],
            annotationsEnabled,
            verboseEnabled,
            collapse,
          );
        length = Object.keys(value).length;
        break;
      case "enumMembers":
      case "namespaceMembers":
        buildWithAnnotations = (): ReturnType<typeof buildMapSection> =>
          buildMapSection(
            key,
            value as Parameters<typeof buildMapSection>[1],
            annotationsEnabled,
            verboseEnabled,
            collapse,
          );
        length = Object.keys(value).length;

        break;
    }

    if (buildWithAnnotations) {
      const { sections, annotations } = buildWithAnnotations();
      outputAnnotations.push(...annotations);
      for (const section of sections) {
        outputSections.push(section);
      }
      core.debug(`[buildSection]: Parsed ${key} (${length})`);
    }
  }

  return { sections: outputSections, annotations: outputAnnotations };
}

/**
 * @returns the parsed value, or undefined when `candidate` is not JSON.
 * JSON cannot encode undefined, so it is unambiguous as a sentinel.
 */
function tryParseJson(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

/**
 * Simple collection attempt of the input as a single line of JSON.
 *
 * This is the default output from `knip`'s JSON reporter.
 *
 * Assume the report is the last line that is wrapped in braces and parses
 * as JSON. Parsing guards against a trailing log line such as `{done}`, and
 * trimming keeps a CRLF line ending from hiding the closing brace.
 */
function findSingleLineJson(lines: string[]): unknown {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line?.startsWith("{") || !line.endsWith("}")) {
      continue;
    }
    const parsed = tryParseJson(line);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * More complex collection attempt of the input as JSON that spans
 * multiple lines.
 *
 * Walks backwards from each `}` line to a `{` line and verifies the span
 * with JSON.parse. Only `{` lines at the same indentation as the `}` line
 * are tried: a pretty printer aligns an object's braces, and trying every
 * nested `{` made the scan quadratic in the number of objects.
 */
function findMultiLineJson(lines: string[]): unknown {
  for (let end = lines.length - 1; end >= 0; end--) {
    const endLine = lines[end];
    if (!endLine?.trimEnd().endsWith("}")) {
      continue;
    }
    const indent = indentOf(endLine);

    for (let start = end; start >= 0; start--) {
      const startLine = lines[start];
      if (!startLine?.trimStart().startsWith("{") || indentOf(startLine) !== indent) {
        continue;
      }
      const parsed = tryParseJson(lines.slice(start, end + 1).join("\n"));
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }
  return undefined;
}

/**
 * Knip in some cases can end up causing javascript on
 * config files to evaluate. This means that if the consumer
 * outputs logs or information that could be misinterpreted as the
 * report.
 *
 * Attempts single-line collection first, falling back to multi-line
 * traversal to find the JSON string if single-line collection fails.
 */
export function getJsonFromOutput(output: string): unknown {
  const lines = output.split(/\n/);

  // If the knip output is unformatted/unmodified, it will be a
  // single line of JSON, which makes parsing fast and simple.
  const singleLineJsonParseResult = findSingleLineJson(lines);
  if (singleLineJsonParseResult !== undefined) {
    return singleLineJsonParseResult;
  }

  // If the knip output has been provided, it may be autoformatted
  // making it certainly a multiline string.
  core.debug("Failed to collect JSON with single-line method, retrying with multi-line method");
  const multiLineJsonParseResult = findMultiLineJson(lines);
  if (multiLineJsonParseResult !== undefined) {
    return multiLineJsonParseResult;
  }

  throw new Error("Unable to find JSON blob");
}

export async function getJsonFromInputFile(filePath: string): Promise<unknown> {
  try {
    await fs.stat(filePath);
  } catch (err) {
    throw new Error(`Provided 'json_report_path' does not exist: ${filePath}`, { cause: err });
  }

  const content = await fs.readFile(filePath, "utf-8");

  if (!content) {
    throw new Error(`Provided 'json_report_path' is empty: ${filePath}`);
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Provided 'json_report_path' content contains invalid JSON: ${filePath}`, {
      cause: err,
    });
  }
}

async function getOutput(buildScriptName: string, cwd?: string): Promise<unknown> {
  const cmd = await timeTask("Build knip command", () => buildRunKnipCommand(buildScriptName, cwd));
  const { stdout, exitCode } = await run(cmd);

  try {
    return getJsonFromOutput(stdout);
  } catch (error) {
    // Knip exits 1 for findings and 2 for its own errors, and a shell gives
    // 127 for a missing command, so the code tells the user where to look.
    throw new Error(`Unable to find JSON blob in knip output (exit code ${exitCode ?? 0})`, {
      cause: error,
    });
  }
}

/**
 * Knip reports paths relative to the directory it ran in, while the Checks
 * API needs them relative to the repository root, which is the workspace.
 *
 * @returns the posix prefix to join onto each annotation path, empty when
 * knip ran at the workspace root
 */
export function annotationPathPrefix(cwd: string | undefined): string {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const prefix = path.relative(workspace, path.resolve(cwd ?? "."));
  return prefix.split(path.sep).join(path.posix.sep);
}

function toRepoRelativeAnnotations(annotations: ItemMeta[], cwd: string | undefined): ItemMeta[] {
  const prefix = annotationPathPrefix(cwd);
  if (prefix === "") {
    return annotations;
  }

  if (prefix.startsWith("..")) {
    core.warning(
      `working_directory '${cwd ?? "."}' is outside the workspace, annotations may not resolve to files in the repository`,
    );
    return annotations;
  }

  return annotations.map((annotation) => ({
    ...annotation,
    path: path.posix.join(prefix, annotation.path),
  }));
}

interface RunKnipTasksOpts {
  buildScriptName: string;
  jsonReportPath?: string;
  annotationsEnabled: boolean;
  verboseEnabled: boolean;
  collapse: CollapseSections;
  cwd?: string;
}

export async function runKnipTasks({
  buildScriptName,
  jsonReportPath,
  annotationsEnabled,
  verboseEnabled,
  collapse,
  cwd,
}: RunKnipTasksOpts): Promise<{ sections: string[]; annotations: ItemMeta[] }> {
  const taskMs = Date.now();
  core.info("- Running Knip tasks");

  const output = jsonReportPath
    ? await timeTask("Get knip report from file", () => getJsonFromInputFile(jsonReportPath))
    : await timeTask("Run knip", () => getOutput(buildScriptName, cwd));
  const report = await timeTask("Parse knip report", () =>
    Promise.resolve(parseJsonReport(output)),
  );
  const { sections, annotations } = await timeTask("Convert report to markdown", () =>
    Promise.resolve(buildMarkdownSections(report, annotationsEnabled, verboseEnabled, collapse)),
  );

  core.info(`✔ Running Knip tasks (${Date.now() - taskMs}ms)`);
  return { sections, annotations: toRepoRelativeAnnotations(annotations, cwd) };
}
