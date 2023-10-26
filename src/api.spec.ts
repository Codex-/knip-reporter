import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type SpyInstance,
  vi,
} from "vitest";

import type { ActionConfig } from "./action.ts";
import {
  createCheck,
  createComment,
  deleteComment,
  init,
  listCommentIds,
  updateCheck,
  updateComment,
} from "./api.ts";

vi.mock("@actions/core");

describe("API", () => {
  const cfg: ActionConfig = {
    token: "secret",
    commandScriptName: "npm",
    commentId: "knip-report",
    annotations: true,
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
      const restSpy = vi.spyOn(octokit.rest.issues, "createComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 201,
        }) as any,
      );

      const state = await createComment(123456, "");
      expect(state.status).toStrictEqual(201);
      expect(restSpy).toBeCalledWith({
        owner: "a",
        repo: "b",
        issue_number: 123456,
        body: "",
      });
    });

    it("should pass through issue_number", async () => {
      const restSpy = vi.spyOn(octokit.rest.issues, "createComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 201,
        }) as any,
      );

      await createComment(123, "");
      expect(restSpy.mock.calls[0]![0]!.issue_number).toStrictEqual(123);
      await createComment(456, "");
      expect(restSpy.mock.calls[1]![0]!.issue_number).toStrictEqual(456);
    });

    it("should pass through body", async () => {
      const restSpy = vi.spyOn(octokit.rest.issues, "createComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 201,
        }) as any,
      );

      await createComment(123, "first");
      expect(restSpy.mock.calls[0]![0]!.body).toStrictEqual("first");
      await createComment(123, "second");
      expect(restSpy.mock.calls[1]![0]!.body).toStrictEqual("second");
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

  describe("listCommentIds", () => {
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
      const commentIds = await listCommentIds("knip", 123456);
      expect(commentIds).toBeUndefined();
    });

    it("should return an ID for a single match", async () => {
      listCommentsToReturn = [[{ id: 0, body: "" }], [{ id: 123, body: "knip" }]];
      const commentIds = await listCommentIds("knip", 123456);
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
      const commentIds = await listCommentIds("knip", 123456);
      expect(Array.isArray(commentIds)).toStrictEqual(true);
      expect(commentIds?.length).toStrictEqual(2);
      expect(commentIds!).toContain(123);
      expect(commentIds!).toContain(456);
    });

    it("should not return an invalid match", async () => {
      listCommentsToReturn = [[{ id: 0, body: "" }], [{ id: 123, body: "knop" }]];
      const commentIds = await listCommentIds("knip", 123456);
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

      await expect(listCommentIds("knip", 123456)).rejects.toThrow(
        `Failed to find comment ID, expected 200 but received ${errorStatus}`,
      );
    });
  });

  describe("updateComment", () => {
    it("should not throw", async () => {
      const restSpy = vi.spyOn(octokit.rest.issues, "updateComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      const state = await updateComment(123456, "");
      expect(state.status).toStrictEqual(200);
      expect(restSpy).toBeCalledWith({
        owner: "a",
        repo: "b",
        comment_id: 123456,
        body: "",
      });
    });

    it("should pass through comment_id", async () => {
      const restSpy = vi.spyOn(octokit.rest.issues, "updateComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      await updateComment(123, "");
      expect(restSpy.mock.calls[0]![0]!.comment_id).toStrictEqual(123);
      await updateComment(456, "");
      expect(restSpy.mock.calls[1]![0]!.comment_id).toStrictEqual(456);
    });

    it("should pass through body", async () => {
      const restSpy = vi.spyOn(octokit.rest.issues, "updateComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      await updateComment(123, "first");
      expect(restSpy.mock.calls[0]![0]!.body).toStrictEqual("first");
      await updateComment(123, "second");
      expect(restSpy.mock.calls[1]![0]!.body).toStrictEqual("second");
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
      const restSpy = vi.spyOn(octokit.rest.issues, "deleteComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 204,
        }) as any,
      );

      const state = await deleteComment(123456);
      expect(state.status).toStrictEqual(204);
      expect(restSpy).toBeCalledWith({
        comment_id: 123456,
        owner: "a",
        repo: "b",
      });
    });

    it("should pass through comment_id", async () => {
      const restSpy = vi.spyOn(octokit.rest.issues, "deleteComment").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 204,
        }) as any,
      );

      await deleteComment(123);
      expect(restSpy.mock.calls[0]![0]!.comment_id).toStrictEqual(123);
      await deleteComment(456);
      expect(restSpy.mock.calls[1]![0]!.comment_id).toStrictEqual(456);
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

  describe("createCheck", () => {
    it("should not throw", async () => {
      const restSpy = vi.spyOn(octokit.rest.checks, "create").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 201,
        }) as any,
      );

      const state = await createCheck();
      expect(state.status).toStrictEqual(201);
      expect(restSpy).toBeCalledWith({
        owner: "a",
        repo: "b",
        head_sha: undefined,
        name: "knip-reporter",
        status: "in_progress",
      });
    });

    it("should throw if a non-201 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(octokit.rest.checks, "create").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }) as any,
      );

      await expect(createCheck()).rejects.toThrow(
        `Failed to create check, expected 201 but received ${errorStatus}`,
      );
    });
  });

  describe("updateCheck", () => {
    it("should not throw", async () => {
      vi.spyOn(octokit.rest.checks, "update").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      const state = await updateCheck(123, "in_progress");
      expect(state.status).toStrictEqual(200);
    });

    it("should pass through check_run_id", async () => {
      const restSpy = vi.spyOn(octokit.rest.checks, "update").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      await updateCheck(123, "in_progress");
      expect(restSpy.mock.calls[0]![0]!.check_run_id).toStrictEqual(123);
      await updateCheck(456, "in_progress");
      expect(restSpy.mock.calls[1]![0]!.check_run_id).toStrictEqual(456);
    });

    it("should pass through status", async () => {
      const restSpy = vi.spyOn(octokit.rest.checks, "update").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      await updateCheck(123, "in_progress");
      expect(restSpy.mock.calls[0]![0]!.status).toStrictEqual("in_progress");
      await updateCheck(456, "completed");
      expect(restSpy.mock.calls[1]![0]!.status).toStrictEqual("completed");
    });

    it("should pass through output", async () => {
      const restSpy = vi.spyOn(octokit.rest.checks, "update").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      await updateCheck(123, "in_progress", { title: "Test Output 1", summary: "Test Summary 1" });
      expect(restSpy.mock.calls[0]![0]!.output).toStrictEqual({
        summary: "Test Summary 1",
        title: "Test Output 1",
      });
      await updateCheck(123, "in_progress", { title: "Test Output 2", summary: "Test Summary 2" });
      expect(restSpy.mock.calls[1]![0]!.output).toStrictEqual({
        summary: "Test Summary 2",
        title: "Test Output 2",
      });
    });

    it("should pass through conclusion", async () => {
      const restSpy = vi.spyOn(octokit.rest.checks, "update").mockReturnValue(
        Promise.resolve({
          data: {},
          status: 200,
        }) as any,
      );

      await updateCheck(123, "in_progress", undefined, "failure");
      expect(restSpy.mock.calls[0]![0]!.conclusion).toStrictEqual("failure");
      await updateCheck(123, "in_progress", undefined, "success");
      expect(restSpy.mock.calls[1]![0]!.conclusion).toStrictEqual("success");
    });

    it("should throw if a non-201 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(octokit.rest.checks, "create").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }) as any,
      );

      await expect(createCheck()).rejects.toThrow(
        `Failed to create check, expected 201 but received ${errorStatus}`,
      );
    });
  });
});
