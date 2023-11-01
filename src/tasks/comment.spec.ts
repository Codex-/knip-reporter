import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

import * as api from "../api.ts";
import { createOrUpdateComments, deleteComments } from "./comment.ts";

vi.mock("@actions/core");
vi.mock("../api.ts");

describe("comment", () => {
  describe("createOrUpdateComments", () => {
    it("should create comments", async () => {
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((async () => ({
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
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((async () => ({
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
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((async () => ({
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
      const createCommentSpy = vi.spyOn(api, "createComment").mockImplementation((async () => ({
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
});
