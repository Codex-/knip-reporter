import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import * as action from "./action.ts";
import * as api from "./api.ts";
import { main } from "./main.ts";
import * as check from "./tasks/check.ts";
import * as comment from "./tasks/comment.ts";
import * as knipTasks from "./tasks/knip.ts";
import * as task from "./tasks/task.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("@actions/github");
vi.mock("./action.ts");
vi.mock("./api.ts");
vi.mock("./tasks/check.ts", async () => {
  const actual: typeof import("./tasks/check.ts") = await vi.importActual("./tasks/check.ts");
  return {
    ...actual,
    createCheckId: vi.fn(),
    updateCheckAnnotations: vi.fn(),
    resolveCheck: vi.fn(),
  };
});
vi.mock("./tasks/comment.ts");
vi.mock("./tasks/knip.ts");
vi.mock("./tasks/task.ts");

describe("main", () => {
  const { coreInfoLogMock, coreErrorLogMock, coreWarningLogMock, assertOnlyCalled } =
    mockLoggingFunctions();

  const baseConfig: action.ActionConfig = {
    token: "secret",
    commandScriptName: "knip",
    commentId: "knip-report",
    annotations: true,
    verbose: false,
    ignoreResults: false,
    workingDirectory: ".",
  };

  let coreSetFailedMock: MockInstance<typeof core.setFailed>;
  let actionGetConfigMock: MockInstance<typeof action.getConfig>;
  let apiInitMock: MockInstance<typeof api.init>;
  let createCheckIdMock: MockInstance<typeof check.createCheckId>;
  let updateCheckAnnotationsMock: MockInstance<typeof check.updateCheckAnnotations>;
  let resolveCheckMock: MockInstance<typeof check.resolveCheck>;
  let runKnipTasksMock: MockInstance<typeof knipTasks.runKnipTasks>;
  let runCommentTaskMock: MockInstance<typeof comment.runCommentTask>;

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    coreSetFailedMock = vi.spyOn(core, "setFailed");

    github.context.payload.pull_request = { number: 42 };
    Object.defineProperty(github.context, "eventName", {
      value: "pull_request",
      configurable: true,
      writable: true,
    });

    actionGetConfigMock = vi.spyOn(action, "getConfig").mockReturnValue({ ...baseConfig });
    vi.spyOn(action, "configToStr").mockReturnValue("  with config: ###");
    apiInitMock = vi.spyOn(api, "init");

    createCheckIdMock = vi.spyOn(check, "createCheckId").mockResolvedValue(123);
    updateCheckAnnotationsMock = vi
      .spyOn(check, "updateCheckAnnotations")
      .mockResolvedValue(new check.AnnotationsCount());
    resolveCheckMock = vi.spyOn(check, "resolveCheck").mockResolvedValue();

    runKnipTasksMock = vi
      .spyOn(knipTasks, "runKnipTasks")
      .mockResolvedValue({ sections: [], annotations: [] });
    runCommentTaskMock = vi.spyOn(comment, "runCommentTask").mockResolvedValue();

    // Pass timeTask's callback through so the wrapped function still runs
    vi.spyOn(task, "timeTask").mockImplementation((_name, fn) => Promise.resolve(fn()));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should run the happy path with annotations and no findings", async () => {
    // Behaviour
    await main();

    expect(actionGetConfigMock).toHaveBeenCalledOnce();
    expect(apiInitMock).toHaveBeenCalledOnce();
    expect(apiInitMock).toHaveBeenCalledWith(expect.objectContaining({ annotations: true }));

    expect(createCheckIdMock).toHaveBeenCalledOnce();
    expect(runKnipTasksMock).toHaveBeenCalledWith("knip", true, false, ".");
    expect(runCommentTaskMock).toHaveBeenCalledWith("knip-report", 42, []);
    expect(updateCheckAnnotationsMock).toHaveBeenCalledWith(123, [], false);

    expect(coreSetFailedMock).not.toHaveBeenCalled();
    expect(resolveCheckMock).toHaveBeenCalledOnce();
    expect(resolveCheckMock.mock.lastCall?.[0]).toStrictEqual(123);
    expect(resolveCheckMock.mock.lastCall?.[1]).toStrictEqual("success");

    // Logging
    assertOnlyCalled(coreInfoLogMock);
  });

  it("should fail and resolve check as failure when knip reports findings", async () => {
    runKnipTasksMock.mockResolvedValue({
      sections: ["### Unused files\n\n`foo.ts`"],
      annotations: [],
    });

    // Behaviour
    await main();

    expect(coreSetFailedMock).toHaveBeenCalledOnce();
    expect(coreSetFailedMock).toHaveBeenCalledWith(
      "knip has resulted in findings, please see the report for more details",
    );
    expect(resolveCheckMock.mock.lastCall?.[1]).toStrictEqual("failure");

    // Logging
    assertOnlyCalled(coreInfoLogMock);
  });

  it("should skip check work when annotations are disabled", async () => {
    actionGetConfigMock.mockReturnValue({ ...baseConfig, annotations: false });

    // Behaviour
    await main();

    expect(createCheckIdMock).not.toHaveBeenCalled();
    expect(updateCheckAnnotationsMock).not.toHaveBeenCalled();
    expect(resolveCheckMock).not.toHaveBeenCalled();
    expect(coreSetFailedMock).not.toHaveBeenCalled();

    // Logging
    assertOnlyCalled(coreInfoLogMock);
  });

  it("should not setFailed when ignoreResults is true even with findings", async () => {
    actionGetConfigMock.mockReturnValue({ ...baseConfig, ignoreResults: true });
    runKnipTasksMock.mockResolvedValue({
      sections: ["### Unused files\n\n`foo.ts`"],
      annotations: [],
    });

    // Behaviour
    await main();

    expect(coreSetFailedMock).not.toHaveBeenCalled();
    expect(resolveCheckMock.mock.lastCall?.[1]).toStrictEqual("success");

    // Logging
    assertOnlyCalled(coreInfoLogMock);
  });

  it("should setFailed when invoked outside a pull_request event", async () => {
    delete github.context.payload.pull_request;
    Object.defineProperty(github.context, "eventName", {
      value: "push",
      configurable: true,
      writable: true,
    });

    // Behaviour
    await main();

    expect(apiInitMock).not.toHaveBeenCalled();
    expect(runKnipTasksMock).not.toHaveBeenCalled();
    expect(coreSetFailedMock).toHaveBeenCalledOnce();
    expect(coreSetFailedMock.mock.lastCall?.[0]).toBeInstanceOf(TypeError);

    // Logging
    assertOnlyCalled(coreInfoLogMock, coreErrorLogMock);
    expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatch(
      /knip-reporter currently only supports 'pull_request' events/,
    );
  });

  it("should preserve the findings setFailed message when resolveCheck throws", async () => {
    runKnipTasksMock.mockResolvedValue({
      sections: ["### Unused files\n\n`foo.ts`"],
      annotations: [],
    });
    resolveCheckMock.mockRejectedValue(new Error("API down"));

    // Behaviour
    await main();

    // The findings message should be the only setFailed call.
    // The resolveCheck failure should be logged as a warning, not override setFailed.
    expect(coreSetFailedMock).toHaveBeenCalledOnce();
    expect(coreSetFailedMock).toHaveBeenCalledWith(
      "knip has resulted in findings, please see the report for more details",
    );

    // Logging
    assertOnlyCalled(coreInfoLogMock, coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledOnce();
    expect(coreWarningLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
      `"Unable to resolve check: API down"`,
    );
  });
});
