import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

import * as api from "../api.ts";
import { reportJson } from "./__fixtures__/knip.fixture.ts";
import { buildComments, createOrUpdateComments, deleteComments } from "./comment.ts";
import { buildFilesSection, buildMarkdownSections, parseJsonReport } from "./knip.ts";

vi.mock("@actions/core");
vi.mock("../api.ts");

describe("comment", () => {
  describe("createOrUpdateComments", () => {
    it("should create comments", async () => {
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((() => ({
        data: { id: 0 },
      })) as unknown as typeof api.createComment);
      const comments = ["test1", "test2", "test3"];
      const toDelete = await createOrUpdateComments(0, comments);

      expect(createCommentSpy).toHaveBeenCalledTimes(comments.length);
      for (let i = 0; i < comments.length; i++) {
        expect(createCommentSpy.mock.calls[i]?.[1]).toStrictEqual(comments[i]);
      }
      expect(toDelete).toHaveLength(0);
    });

    it("should update comments", async () => {
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((() => ({
        data: { id: 0 },
      })) as unknown as typeof api.createComment);
      const updateCommentSpy = vi.spyOn(api, "updateComment");
      const ids = [0, 1, 2];
      const comments = ["test1", "test2", "test3"];
      const toDelete = await createOrUpdateComments(0, comments, ids);

      expect(createCommentSpy).not.toHaveBeenCalled();
      expect(updateCommentSpy).toHaveBeenCalledTimes(ids.length);
      for (let i = 0; i < ids.length; i++) {
        expect(updateCommentSpy.mock.calls[i]?.[0]).toStrictEqual(ids[i]);
        expect(updateCommentSpy.mock.calls[i]?.[1]).toStrictEqual(comments[i]);
      }
      expect(toDelete).toHaveLength(0);
    });

    it("should update if possible or create", async () => {
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((() => ({
        data: { id: 0 },
      })) as unknown as typeof api.createComment);
      const updateCommentSpy = vi.spyOn(api, "updateComment");
      const ids = [0, 1];
      const comments = ["test1", "test2", "test3"];
      const toDelete = await createOrUpdateComments(0, comments, ids);

      expect(createCommentSpy).toHaveBeenCalledOnce();
      expect(updateCommentSpy).toHaveBeenCalledTimes(2);

      expect(updateCommentSpy.mock.calls[0]?.[0]).toStrictEqual(ids[0]);
      expect(updateCommentSpy.mock.calls[0]?.[1]).toStrictEqual(comments[0]);

      expect(updateCommentSpy.mock.calls[1]?.[0]).toStrictEqual(ids[1]);
      expect(updateCommentSpy.mock.calls[1]?.[1]).toStrictEqual(comments[1]);

      expect(createCommentSpy.mock.calls[0]?.[1]).toStrictEqual(comments[2]);

      expect(toDelete).toHaveLength(0);
    });

    it("should return extraneous IDs to be delete", async () => {
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((() => ({
        data: { id: 0 },
      })) as unknown as typeof api.createComment);
      const updateCommentSpy = vi.spyOn(api, "updateComment");
      const ids = [0, 1, 2, 3, 4];
      const comments = ["test1"];
      const toDelete = await createOrUpdateComments(0, comments, ids);

      expect(createCommentSpy).not.toHaveBeenCalled();
      expect(updateCommentSpy).toHaveBeenCalledOnce();
      expect(toDelete).toHaveLength(ids.length - comments.length);
      expect(toDelete).toStrictEqual([1, 2, 3, 4]);
    });
  });

  describe("deleteComments", () => {
    it("should delete provided comment IDs", async () => {
      const coreInfoSpy = vi.spyOn(core, "info").mockImplementation(() => undefined);
      const deleteCommentSpy = vi.spyOn(api, "deleteComment");
      const ids = [0, 1, 2, 3, 4];

      await deleteComments(ids);

      expect(deleteCommentSpy).toHaveBeenCalledTimes(ids.length);
      for (let i = 0; i < ids.length; i++) {
        expect(deleteCommentSpy.mock.calls[i]?.[0]).toStrictEqual(ids[i]);
        // * 2 because we want the first call of each call to the logger
        expect(coreInfoSpy.mock.calls[i * 2]?.[0]).toContain(`Delete comment ${ids[i]}`);
      }
    });

    it("should not make any api calls if an empty array is provided", async () => {
      const coreInfoSpy = vi.spyOn(core, "info").mockImplementation(() => undefined);
      const deleteCommentSpy = vi.spyOn(api, "deleteComment");

      await deleteComments([]);

      expect(coreInfoSpy).not.toHaveBeenCalled();
      expect(deleteCommentSpy).not.toHaveBeenCalled();
    });
  });

  describe("buildComments", () => {
    const parsedReport = parseJsonReport(JSON.stringify(reportJson));

    const shortSections = [buildFilesSection(["Ratchet.ts", "Clank.ts"])];
    const manyShortSections = (() => {
      const toReturn: string[] = [];
      const { sections } = buildMarkdownSections(parsedReport, false, true);
      for (let i = 0; i < 100; i++) {
        toReturn.push(...sections);
      }
      return toReturn;
    })();
    const longSection = (() => {
      const files: string[] = [];
      let currentLength = 0;
      const toAdd = ["Ratchet.ts", "Clank.ts"];
      const toAddLength = toAdd.reduce((acc: number, curr: string) => (acc += curr.length), 0);
      while (currentLength < api.GITHUB_COMMENT_MAX_COMMENT_LENGTH) {
        files.push(...toAdd);
        currentLength += toAddLength;
      }
      return [buildFilesSection(files)];
    })();

    it("should inject a provided comment ID", () => {
      let comments = buildComments("hello", shortSections);

      expect(comments).toHaveLength(1);
      expect(comments[0]).toContain("<!-- hello-0 -->");

      comments = buildComments("goodbye", shortSections);

      expect(comments).toHaveLength(1);
      expect(comments[0]).toContain("<!-- goodbye-0 -->");
    });

    it("should increase the number on the injected comment for each comment generated", () => {
      const comments = buildComments("hello", manyShortSections);

      expect(comments).toHaveLength(4);
      expect(comments[0]).toContain("<!-- hello-0 -->");
      expect(comments[1]).toContain("<!-- hello-1 -->");
      expect(comments[2]).toContain("<!-- hello-2 -->");
      expect(comments[3]).toContain("<!-- hello-3 -->");
    });

    it("should output multiple comments if all sections exceed the max character limit", () => {
      const comments = buildComments("hello", manyShortSections);

      expect(comments).toHaveLength(4);
      expect(comments).toMatchSnapshot();
    });

    it("should output a long section", () => {
      const coreWarningSpy = vi.spyOn(core, "warning");
      const comments = buildComments("hello", longSection);

      expect(comments).toHaveLength(0);
      expect(coreWarningSpy).toHaveBeenCalledTimes(3);
      expect(coreWarningSpy.mock.calls[0]?.[0]).toContain("Unused files");
      expect(coreWarningSpy.mock.calls[0]?.[0]).toContain(longSection[0]?.length);
      expect(coreWarningSpy.mock.calls[1]?.[0]).toContain(
        "Skipping this section, please see output below:",
      );
      expect(coreWarningSpy.mock.calls[2]?.[0]).toStrictEqual(longSection[0]);
    });

    it("should not output a warning for a regular section", () => {
      const coreWarningSpy = vi.spyOn(core, "warning");
      const comments = buildComments("hello", shortSections);

      expect(comments).toHaveLength(1);
      expect(coreWarningSpy).not.toHaveBeenCalled();
    });
  });
});
