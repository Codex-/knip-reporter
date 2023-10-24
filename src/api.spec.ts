import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type SpyInstance,
} from "vitest";

import type { ActionConfig } from "./action.ts";
import { createComment, deleteComment, getCommentIds, init, updateComment } from "./api.ts";

vi.mock("@actions/core");

describe("API", () => {
  const cfg: ActionConfig = {
    token: "secret",
    commandScriptName: "npm",
    commentId: "knip-report",
    ignoreResults: false,
  };
  type Octokit = ReturnType<(typeof github)["getOctokit"]>;
  let octokit: Octokit;

  beforeAll(() => {
    octokit = github.getOctokit("token", {
      request: {
        fetch: vi.fn(async () => {
          throw new Error("API calls should be mocked");
        }),
      },
    });
  });

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = "a/b";

    vi.spyOn(core, "getInput").mockReturnValue("");
    vi.spyOn(github, "getOctokit").mockReturnValue(octokit);
    init(cfg);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createComment", () => {
    it("should not throw", async () => {
      vi.spyOn(octokit.rest.issues, "createComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 201,
        }) as any,
      );

      const state = await createComment(123456, "");
      expect(state.status).toStrictEqual(201);
    });

    it("should throw if a non-201 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(octokit.rest.issues, "createComment").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }) as any,
      );

      await expect(createComment(123456, "")).rejects.toThrow(
        `Failed to create comment, expected 201 but received ${errorStatus}`,
      );
    });
  });

  describe("getCommentIds", () => {
    let listCommentsToReturn: any[];
    let listCommentsSpy: SpyInstance;

    beforeEach(() => {
      // This mock may look like a case of "set foo assert foo is foo" but we don't need to test the
      // github API, we're testing that our iterator handling works as expected.
      let call = 0;
      listCommentsSpy = vi
        .spyOn(octokit.rest.issues, "listComments")
        .mockImplementation((async () => {
          const toReturn = listCommentsToReturn[call];
          call++;

          if (!toReturn) {
            return undefined;
          }

          return {
            data: toReturn,
            status: 200,
          };
        }) as any);

      vi.spyOn(octokit.paginate, "iterator").mockImplementation((rest: any) => {
        return (async function* () {
          const boundRest = rest;
          let results: any = await boundRest();
          while (results) {
            yield results;
            results = await boundRest();
          }
        })();
      });
    });

    it("should return undefined for no results", async () => {
      listCommentsToReturn = [[{ id: 0, body: "" }]];
      const commentIds = await getCommentIds("knip", 123456);
      expect(commentIds).toBeUndefined();
    });

    it("should return an ID for a single match", async () => {
      listCommentsToReturn = [[{ id: 0, body: "" }], [{ id: 123, body: "knip" }]];
      const commentIds = await getCommentIds("knip", 123456);
      expect(Array.isArray(commentIds)).toStrictEqual(true);
      expect(commentIds?.length).toStrictEqual(1);
      expect(commentIds!).toContain(123);
    });

    it("should return an ID for every match", async () => {
      listCommentsToReturn = [
        [{ id: 0, body: "" }],
        [{ id: 123, body: "knip" }],
        [{ id: 456, body: "knip" }],
        [{ id: 789, body: "knop" }],
      ];
      const commentIds = await getCommentIds("knip", 123456);
      expect(Array.isArray(commentIds)).toStrictEqual(true);
      expect(commentIds?.length).toStrictEqual(2);
      expect(commentIds!).toContain(123);
      expect(commentIds!).toContain(456);
    });

    it("should not return an invalid match", async () => {
      listCommentsToReturn = [[{ id: 0, body: "" }], [{ id: 123, body: "knop" }]];
      const commentIds = await getCommentIds("knip", 123456);
      expect(commentIds).toBeUndefined();
    });

    it("should throw if a non-201 status is returned", async () => {
      listCommentsSpy.mockRestore();

      const errorStatus = 401;
      vi.spyOn(octokit.rest.issues, "listComments").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        } as any),
      );

      await expect(getCommentIds("knip", 123456)).rejects.toThrow(
        `Failed to find comment ID, expected 200 but received ${errorStatus}`,
      );
    });
  });

  describe("updateComment", () => {
    it("should not throw", async () => {
      vi.spyOn(octokit.rest.issues, "updateComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      const state = await updateComment(123456, "");
      expect(state.status).toStrictEqual(200);
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(octokit.rest.issues, "updateComment").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }) as any,
      );

      await expect(updateComment(123456, "")).rejects.toThrow(
        `Failed to update comment, expected 200 but received ${errorStatus}`,
      );
    });
  });

  describe("deleteComment", () => {
    it("should not throw", async () => {
      vi.spyOn(octokit.rest.issues, "deleteComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 204,
        }) as any,
      );

      const state = await deleteComment(123456);
      expect(state.status).toStrictEqual(204);
    });

    it("should throw if a non-204 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(octokit.rest.issues, "deleteComment").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }) as any,
      );

      await expect(deleteComment(123456)).rejects.toThrow(
        `Failed to delete comment, expected 204 but received ${errorStatus}`,
      );
    });
  });
});
