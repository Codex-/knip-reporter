import * as core from "@actions/core";
import * as github from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

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
vi.mock("@actions/github");

async function* mockPageIterator<T, P>(
  apiMethod: (params?: P) => Promise<T>,
  params: P,
): AsyncGenerator<T, void> {
  yield await apiMethod(params);
}

interface MockResponse {
  data: any;
  status: number;
}

const mockOctokit = {
  rest: {
    checks: {
      create: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      update: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
    issues: {
      createComment: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      deleteComment: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listComments: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      updateComment: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
  },
  paginate: {
    iterator: mockPageIterator,
  },
};

describe("API", () => {
  const cfg: ActionConfig = {
    token: "secret",
    commandScriptName: "npm",
    commentId: "knip-report",
    annotations: true,
    verbose: false,
    ignoreResults: false,
  };

  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = "a/b";

    vi.spyOn(core, "getInput").mockReturnValue("");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(github, "getOctokit").mockReturnValue(mockOctokit as any);
    init(cfg);

    if (!github.context.payload.pull_request) {
      github.context.payload.pull_request = { head: {} } as any;
    }
    github.context.payload.pull_request!.head.sha = "12345678";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createComment", () => {
    it("should not throw", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "createComment").mockResolvedValue({
        data: {},
        status: 201,
      });

      const state = await createComment(123456, "");
      expect(restSpy).toHaveBeenCalledOnce();
      expect(state.status).toStrictEqual(201);
      expect(state).toMatchInlineSnapshot(`
        {
          "data": {},
          "status": 201,
        }
      `);
    });

    it("should pass through issue_number", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "createComment").mockResolvedValue({
        data: {},
        status: 201,
      });

      await createComment(123, "");
      expect(restSpy.mock.calls[0]![0]!.issue_number).toStrictEqual(123);
      await createComment(456, "");
      expect(restSpy.mock.calls[1]![0]!.issue_number).toStrictEqual(456);
    });

    it("should pass through body", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "createComment").mockResolvedValue({
        data: {},
        status: 201,
      });

      await createComment(123, "first");
      expect(restSpy.mock.calls[0]![0]!.body).toStrictEqual("first");
      await createComment(123, "second");
      expect(restSpy.mock.calls[1]![0]!.body).toStrictEqual("second");
    });

    it("should throw if a non-201 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.issues, "createComment").mockResolvedValue({
        data: undefined,
        status: errorStatus,
      });

      await expect(createComment(123456, "")).rejects.toThrow(
        `Failed to create comment, expected 201 but received ${errorStatus}`,
      );
    });
  });

  describe("listCommentIds", () => {
    let listCommentsToReturn: any[];
    let listCommentsSpy: MockInstance;

    beforeEach(() => {
      // This mock may look like a case of "set foo assert foo is foo" but we don't need to test the
      // github API, we're testing that our iterator handling works as expected.
      let call = 0;
      listCommentsSpy = vi.spyOn(mockOctokit.rest.issues, "listComments").mockImplementation(() => {
        const toReturn = listCommentsToReturn[call];
        call++;

        if (!toReturn) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return undefined as any;
        }

        return Promise.resolve({
          data: toReturn,
          status: 200,
        });
      });

      vi.spyOn(mockOctokit.paginate, "iterator").mockImplementation((rest) => {
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
      vi.spyOn(mockOctokit.rest.issues, "listComments").mockResolvedValue({
        data: undefined,
        status: errorStatus,
      });

      await expect(listCommentIds("knip", 123456)).rejects.toThrow(
        `Failed to find comment ID, expected 200 but received ${errorStatus}`,
      );
    });
  });

  describe("updateComment", () => {
    it("should not throw", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "updateComment").mockResolvedValue({
        data: {},
        status: 200,
      });

      const state = await updateComment(123456, "");
      expect(restSpy).toHaveBeenCalledOnce();
      expect(state.status).toStrictEqual(200);
      expect(state).toMatchInlineSnapshot(`
        {
          "data": {},
          "status": 200,
        }
      `);
    });

    it("should pass through comment_id", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "updateComment").mockResolvedValue({
        data: {},
        status: 200,
      });

      await updateComment(123, "");
      expect(restSpy.mock.calls[0]![0]!.comment_id).toStrictEqual(123);
      await updateComment(456, "");
      expect(restSpy.mock.calls[1]![0]!.comment_id).toStrictEqual(456);
    });

    it("should pass through body", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "updateComment").mockResolvedValue({
        data: {},
        status: 200,
      });

      await updateComment(123, "first");
      expect(restSpy.mock.calls[0]![0]!.body).toStrictEqual("first");
      await updateComment(123, "second");
      expect(restSpy.mock.calls[1]![0]!.body).toStrictEqual("second");
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.issues, "updateComment").mockResolvedValue({
        data: undefined,
        status: errorStatus,
      });

      await expect(updateComment(123456, "")).rejects.toThrow(
        `Failed to update comment, expected 200 but received ${errorStatus}`,
      );
    });
  });

  describe("deleteComment", () => {
    it("should not throw", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "deleteComment").mockResolvedValue({
        data: {},
        status: 204,
      });

      const state = await deleteComment(123456);
      expect(restSpy).toHaveBeenCalledOnce();
      expect(state.status).toStrictEqual(204);
      expect(state).toMatchInlineSnapshot(`
        {
          "data": {},
          "status": 204,
        }
      `);
    });

    it("should pass through comment_id", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.issues, "deleteComment").mockResolvedValue({
        data: {},
        status: 204,
      });

      await deleteComment(123);
      expect(restSpy.mock.calls[0]![0]!.comment_id).toStrictEqual(123);
      await deleteComment(456);
      expect(restSpy.mock.calls[1]![0]!.comment_id).toStrictEqual(456);
    });

    it("should throw if a non-204 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.issues, "deleteComment").mockResolvedValue({
        data: undefined,
        status: errorStatus,
      });

      await expect(deleteComment(123456)).rejects.toThrow(
        `Failed to delete comment, expected 204 but received ${errorStatus}`,
      );
    });
  });

  describe("createCheck", () => {
    it("should not throw", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.checks, "create").mockResolvedValue({
        data: {},
        status: 201,
      });

      const state = await createCheck("knip-reporter", "Knip reporter analysis");
      expect(restSpy).toHaveBeenCalledOnce();
      expect(state.status).toStrictEqual(201);
      expect(state).toMatchInlineSnapshot(`
        {
          "data": {},
          "status": 201,
        }
      `);
    });

    it("should throw if a non-201 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.checks, "create").mockResolvedValue({
        data: undefined,
        status: errorStatus,
      });

      await expect(createCheck("knip-reporter", "Knip reporter analysis")).rejects.toThrow(
        `Failed to create check, expected 201 but received ${errorStatus}`,
      );
    });
  });

  describe("updateCheck", () => {
    it("should not throw", async () => {
      vi.spyOn(mockOctokit.rest.checks, "update").mockResolvedValue({
        data: {},
        status: 200,
      });

      const state = await updateCheck(123, "in_progress");
      expect(state.status).toStrictEqual(200);
    });

    it("should pass through check_run_id", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.checks, "update").mockResolvedValue({
        data: {},
        status: 200,
      });

      await updateCheck(123, "in_progress");
      expect(restSpy.mock.calls[0]![0]!.check_run_id).toStrictEqual(123);
      await updateCheck(456, "in_progress");
      expect(restSpy.mock.calls[1]![0]!.check_run_id).toStrictEqual(456);
    });

    it("should pass through status", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.checks, "update").mockResolvedValue({
        data: {},
        status: 200,
      });

      await updateCheck(123, "in_progress");
      expect(restSpy.mock.calls[0]![0]!.status).toStrictEqual("in_progress");
      await updateCheck(456, "completed");
      expect(restSpy.mock.calls[1]![0]!.status).toStrictEqual("completed");
    });

    it("should pass through output", async () => {
      const restSpy = vi.spyOn(mockOctokit.rest.checks, "update").mockResolvedValue({
        data: {},
        status: 200,
      });

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
      const restSpy = vi.spyOn(mockOctokit.rest.checks, "update").mockResolvedValue({
        data: {},
        status: 200,
      });

      await updateCheck(123, "in_progress", undefined, "failure");
      expect(restSpy.mock.calls[0]![0]!.conclusion).toStrictEqual("failure");
      await updateCheck(123, "in_progress", undefined, "success");
      expect(restSpy.mock.calls[1]![0]!.conclusion).toStrictEqual("success");
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.checks, "update").mockResolvedValue({
        data: undefined,
        status: errorStatus,
      });

      await expect(updateCheck(123, "completed")).rejects.toThrow(
        `Failed to update check, expected 200 but received ${errorStatus}`,
      );
    });
  });
});
