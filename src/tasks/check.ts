import * as core from "@actions/core";
import { markdownTable, type Options as MarkdownTableOptions } from "markdown-table";

import { type CheckConclusion, type CheckOutput, createCheck, updateCheck } from "../api.ts";
import type { ItemMeta } from "./types.ts";

export async function createCheckId(name: string, title: string): Promise<number> {
  core.debug(`[createCheckId]: Creating check, name: ${name}, title: ${title}`);
  const id = (await createCheck(name, title)).data.id;
  core.debug(`[createCheckId]: Check created (${id})`);
  return id;
}

// The Checks API limits the number of annotations to a maximum of 50 per API request.
// https://docs.github.com/en/rest/checks/runs#update-a-check-run
export const CHECK_ANNOTATIONS_UPDATE_LIMIT = 50;

type Unpacked<T> = T extends Array<infer U> ? U : T;
export type Annotation = NonNullable<Unpacked<NonNullable<CheckOutput>["annotations"]>>;
export interface AnnotationsCount {
  classMembers: number;
  enumMembers: number;
}

export async function updateCheckAnnotations(
  checkId: number,
  itemMeta: ItemMeta[],
  ignoreResults: boolean,
): Promise<AnnotationsCount> {
  core.debug(
    `[updateCheckAnnotations]: Begin pushing annotations (${itemMeta.length}) with level '${
      ignoreResults ? "warning" : "failure"
    }'`,
  );

  let classMemberCount = 0;
  let enumMemberCount = 0;
  let i = 0;
  while (i < itemMeta.length) {
    const currentEndIndex =
      i + CHECK_ANNOTATIONS_UPDATE_LIMIT < itemMeta.length
        ? i + CHECK_ANNOTATIONS_UPDATE_LIMIT
        : itemMeta.length;
    core.debug(
      `[updateCheckAnnotations]: Processing ${i}...${currentEndIndex - 1} ` +
        `of ${itemMeta.length - 1}`,
    );

    const annotations: Annotation[] = [];
    for (let j = i; j < currentEndIndex; j++) {
      const meta = itemMeta[j];
      core.debug(`j = ${j}`);
      core.debug(`${meta}`);
      core.debug("====================");

      if (!meta) {
        continue;
      }

      if (meta.type === "class") {
        classMemberCount++;
      } else {
        enumMemberCount++;
      }

      const annotation: Annotation = {
        path: meta.path,
        start_line: meta.start_line,
        end_line: meta.start_line,
        start_column: meta.start_column,
        end_column: meta.start_column + meta.identifier.length,
        annotation_level: ignoreResults ? "warning" : "failure",
        message: `${meta.identifier} is an unused ${meta.type} member`,
      };
      annotations.push(annotation);
    }

    core.debug(`[updateCheckAnnotations]: Updating check ${checkId}`);
    await updateCheck(checkId, "in_progress", {
      title: "Knip reporter analysis",
      summary: "",
      annotations: annotations,
    });

    i += CHECK_ANNOTATIONS_UPDATE_LIMIT;
  }

  core.debug(
    `[updateCheckAnnotations]: Pushing annotations (${itemMeta.length}) to check ${checkId} completed`,
  );

  return { classMembers: classMemberCount, enumMembers: enumMemberCount };
}

export async function resolveCheck(
  checkId: number,
  conclusion: CheckConclusion,
  counts: AnnotationsCount,
): Promise<void> {
  core.debug(`[resolveCheck]: Updating check ${checkId} conclusion (${conclusion})`);
  const summaryTable = summaryMarkdownTable(counts);
  await updateCheck(
    checkId,
    "completed",
    { title: "Knip reporter analysis", summary: summaryTable },
    conclusion,
  );
}

export function summaryMarkdownTable({ classMembers, enumMembers }: AnnotationsCount): string {
  const markdownTableOptions: MarkdownTableOptions = {
    alignDelimiters: false,
    padding: false,
  };
  return markdownTable(
    [
      ["Type", "Found"],
      ["Class Members", `${classMembers}`],
      ["Enum Members", `${enumMembers}`],
    ],
    markdownTableOptions,
  );
}
