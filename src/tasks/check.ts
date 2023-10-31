import * as core from "@actions/core";

import { type CheckConclusion, type CheckOutput, createCheck, updateCheck } from "../api.ts";
import type { MinimalAnnotation } from "./types.ts";

export async function createCheckId(name: string, title: string): Promise<number> {
  core.debug(`[createCheckId]: Creating check, name: ${name}, title: ${title}`);
  const id = (await createCheck(name, title)).data.id;
  core.debug(`[createCheckId]: Check created (${id})`);
  return id;
}

// The Checks API limits the number of annotations to a maximum of 50 per API request.
// https://docs.github.com/en/rest/checks/runs#update-a-check-run
const CHECK_ANNOTATIONS_UPDATE_LIMIT = 50;

type Unpacked<T> = T extends Array<infer U> ? U : T;
type Annotation = NonNullable<Unpacked<NonNullable<CheckOutput>["annotations"]>>;

export async function updateCheckAnnotations(
  checkId: number,
  minimalAnnotations: MinimalAnnotation[],
  ignoreResults = false,
): Promise<void> {
  core.debug(
    `[updateCheckAnnotations]: Begin pushing annotations (${
      minimalAnnotations.length
    }) with level '${ignoreResults ? "warning" : "failure"}'`,
  );

  let i = 0;
  while (i < minimalAnnotations.length) {
    core.debug(
      `[updateCheckAnnotations]: Slicing ${i}...${i + (CHECK_ANNOTATIONS_UPDATE_LIMIT - 1)}`,
    );

    const slice = minimalAnnotations.slice(i, i + CHECK_ANNOTATIONS_UPDATE_LIMIT).map((ma) => {
      const annotation: Annotation = {
        path: ma.path,
        start_line: ma.start_line,
        end_line: ma.start_line,
        start_column: ma.start_column,
        end_column: ma.start_column + ma.identifier.length,
        annotation_level: ignoreResults ? "warning" : "failure",
        message: `\`${ma.identifier}\` is unused`,
      };
      return annotation;
    });

    core.debug(`[updateCheckAnnotations]: Updating check ${checkId}`);
    await updateCheck(checkId, "in_progress", {
      title: "Knip reporter analysis",
      summary: "",
      annotations: slice,
    });

    i += CHECK_ANNOTATIONS_UPDATE_LIMIT;
  }

  core.debug(
    `[updateCheckAnnotations]: Pushing annotations (${minimalAnnotations.length}) to check ${checkId} completed`,
  );
}

export async function resolveCheck(checkId: number, conclusion: CheckConclusion) {
  core.debug(`[resolveCheck]: Updating check ${checkId} conclusion (${conclusion})`);
  return updateCheck(checkId, "in_progress", undefined, conclusion);
}
