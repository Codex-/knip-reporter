import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api.ts";
import {
  type Annotation,
  AnnotationsCount,
  CHECK_ANNOTATIONS_UPDATE_LIMIT,
  createCheckId,
  resolveCheck,
  summaryMarkdownTable,
  updateCheckAnnotations,
} from "./check.ts";
import type { ItemMeta } from "./types.ts";
import { mockLoggingFunctions } from "../test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("../api.ts");

describe("check", () => {
  const { coreDebugLogMock, assertOnlyCalled, assertNoneCalled } = mockLoggingFunctions();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createCheckId", () => {
    it("should return the ID of a newly created Check", async () => {
      const createCheckSpy = vi
        .spyOn(api, "createCheck")
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValue({ data: { id: 123 } } as any);

      // Behaviour
      const id = await createCheckId("testName", "testTitle");
      expect(id).toStrictEqual(123);
      expect(createCheckSpy).toHaveBeenCalledOnce();
      expect(createCheckSpy.mock.lastCall![0]).toStrictEqual("testName");
      expect(createCheckSpy.mock.lastCall![1]).toStrictEqual("testTitle");

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"[createCheckId]: Creating check, name: testName, title: testTitle"`,
      );
      expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(
        `"[createCheckId]: Check created (123)"`,
      );
    });
  });

  describe("updateCheckAnnotations", () => {
    it("should transform a minimal ItemMeta to a valid annotation", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "namespace",
        },
      ];

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations).toMatchSnapshot();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should transform a duplicate ItemMeta to a valid annotation", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "duplicate",
          duplicateIdentifiers: [],
        },
        {
          path: "some/path",
          identifier: "Var2",
          start_line: 0,
          start_column: 0,
          type: "duplicate",
          duplicateIdentifiers: ["Var3"],
        },
        {
          path: "some/path",
          identifier: "Var4",
          start_line: 0,
          start_column: 0,
          type: "duplicate",
          duplicateIdentifiers: ["Var5", "Var6"],
        },
        {
          path: "some/path",
          identifier: "Var7",
          start_line: 0,
          start_column: 0,
          type: "duplicate",
          duplicateIdentifiers: ["Var8", "Var9", "Var10"],
        },
      ];

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations).toMatchSnapshot();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should output a warning annotation if ignoreResults is enabled", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "namespace",
        },
      ];

      // Behaviour
      await updateCheckAnnotations(0, items, true);
      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations![0]?.annotation_level).toStrictEqual(
        "warning",
      );

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should output a failure annotation if ignoreResults is disabled", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "namespace",
        },
      ];

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations![0]?.annotation_level).toStrictEqual(
        "failure",
      );

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should skip undefined or null ItemMeta entries", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "namespace",
        },
        null as unknown as ItemMeta,
        undefined as unknown as ItemMeta,
      ];

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall).toMatchSnapshot();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should not make any calls if there are no ItemMeta entries", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [];

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).not.toHaveBeenCalled();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should output counts for annotations", async () => {
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "export",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "type",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "duplicate",
          duplicateIdentifiers: ["Var2"],
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "namespace",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "enum",
        },
      ];

      // Behaviour
      let counts = await updateCheckAnnotations(0, items, false);
      expect(counts.exports).toStrictEqual(1);
      expect(counts.types).toStrictEqual(1);
      expect(counts.duplicates).toStrictEqual(1);
      expect(counts.namespaceMembers).toStrictEqual(1);
      expect(counts.enumMembers).toStrictEqual(1);

      items.push({
        path: "some/path",
        identifier: "Var",
        start_line: 0,
        start_column: 0,
        type: "namespace",
      });
      items.push({
        path: "some/path",
        identifier: "Var",
        start_line: 0,
        start_column: 0,
        type: "duplicate",
        duplicateIdentifiers: ["Var2", "Var3"],
      });

      counts = await updateCheckAnnotations(0, items, false);

      expect(counts.duplicates).toStrictEqual(2);
      expect(counts.namespaceMembers).toStrictEqual(2);
      expect(counts.enumMembers).toStrictEqual(1);

      items.push(
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "export",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "type",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "duplicate",
          duplicateIdentifiers: ["Var2"],
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "namespace",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "enum",
        },
      );

      counts = await updateCheckAnnotations(0, items, false);

      expect(counts.exports).toStrictEqual(2);
      expect(counts.types).toStrictEqual(2);
      expect(counts.duplicates).toStrictEqual(3);
      expect(counts.namespaceMembers).toStrictEqual(3);
      expect(counts.enumMembers).toStrictEqual(2);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should only make one request with 50 annotations or less", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [...Array(50).keys()].map(() => ({
        path: "some/path",
        identifier: "Var",
        start_line: 0,
        start_column: 0,
        type: "namespace",
      }));

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).toHaveBeenCalledOnce();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should only make three requests with 150 annotations", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const iToType = (i: number): ItemMeta["type"] => {
        switch (i % 5) {
          case 0:
            return "export";
          case 1:
            return "type";
          case 2:
            return "duplicate";
          case 3:
            return "namespace";
          case 4:
            return "enum";
          default:
            throw new Error();
        }
      };
      const items: ItemMeta[] = [...Array(150).keys()].map((i) => {
        const type = iToType(i);
        const meta: Omit<ItemMeta, "type"> = {
          path: "some/path",
          identifier: `Var${i}`,
          start_line: 0,
          start_column: 0,
        };
        switch (type) {
          case "type":
          case "export":
          case "namespace":
          case "enum":
            return {
              ...meta,
              type: type,
            };
          case "duplicate":
            return {
              ...meta,
              type: type,
              duplicateIdentifiers: ["Var2"],
            };
        }
      });

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(updateCheckSpy).toHaveBeenCalledTimes(3);
      for (const call of updateCheckSpy.mock.calls) {
        expect(call[2]?.annotations?.length).toBeLessThanOrEqual(CHECK_ANNOTATIONS_UPDATE_LIMIT);
      }
      expect(updateCheckSpy.mock.calls).toMatchSnapshot();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should send all items provided", async () => {
      const pushedAnnotations: Annotation[] = [];
      vi.spyOn(api, "updateCheck").mockImplementation(((
        _id: Parameters<typeof api.updateCheck>["0"],
        _status: Parameters<typeof api.updateCheck>["1"],
        output: Parameters<typeof api.updateCheck>["2"],
      ) => {
        pushedAnnotations.push(...(output?.annotations ?? []));
      }) as unknown as typeof api.updateCheck);
      const items: ItemMeta[] = [...Array(150).keys()].map((i) => ({
        path: "some/path",
        identifier: `Var${i}`,
        start_line: 0,
        start_column: 0,
        type: i % 2 ? "namespace" : "enum",
      }));

      // Behaviour
      await updateCheckAnnotations(0, items, false);
      expect(pushedAnnotations).toHaveLength(items.length);
      for (let i = 0; i < items.length; i++) {
        expect(pushedAnnotations[i]?.message).toContain(items[i]?.identifier);
      }

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });

    it("should accurately report the count to the debug logger", async () => {
      vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [...Array(130).keys()].map((i) => ({
        path: "some/path",
        identifier: `Var${i}`,
        start_line: 0,
        start_column: 0,
        type: i % 2 ? "namespace" : "enum",
      }));

      // Behaviour
      await updateCheckAnnotations(0, items, false);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      const countLogs = coreDebugLogMock.mock.calls
        .map((call) => call[0])
        .filter((msg) => msg.includes("Processing"));
      expect(countLogs).toHaveLength(3);
      expect(countLogs[0]).toMatch(/Processing 0...49/);
      expect(countLogs[1]).toMatch(/Processing 50...99/);
      expect(countLogs[2]).toMatch(/Processing 100...129/);
    });
  });

  describe("resolveCheck", () => {
    it("should resolve a check with the provided conclusion", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");

      // Behaviour
      await resolveCheck(123, "success", new AnnotationsCount());
      expect(updateCheckSpy.mock.lastCall?.[0]).toStrictEqual(123);
      expect(updateCheckSpy.mock.lastCall?.[1]).toStrictEqual("completed");
      expect(updateCheckSpy.mock.lastCall?.[2]?.title).toStrictEqual("Knip reporter analysis");
      expect((updateCheckSpy.mock.lastCall?.[2]?.summary.length ?? 0) > 0).toStrictEqual(true);
      expect(updateCheckSpy.mock.lastCall?.[3]).toStrictEqual("success");

      await resolveCheck(456, "failure", new AnnotationsCount());

      expect(updateCheckSpy.mock.lastCall?.[0]).toStrictEqual(456);
      expect(updateCheckSpy.mock.lastCall?.[1]).toStrictEqual("completed");
      expect(updateCheckSpy.mock.lastCall?.[2]?.title).toStrictEqual("Knip reporter analysis");
      expect((updateCheckSpy.mock.lastCall?.[2]?.summary.length ?? 0) > 0).toStrictEqual(true);
      expect(updateCheckSpy.mock.lastCall?.[3]).toStrictEqual("failure");

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(2);
    });

    it("should send a summary of counts", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const count = new AnnotationsCount();
      count.exports = 100;
      count.types = 200;
      count.namespaceMembers = 300;
      count.enumMembers = 400;

      // Behaviour
      await resolveCheck(123, "success", count);
      const summary = updateCheckSpy.mock.lastCall?.[2]?.summary;
      expect(summary).toMatch(/\|Exports\|100\|/);
      expect(summary).toMatch(/\|Types\|200\|/);
      expect(summary).toMatch(/\|Namespace Members\|300\|/);
      expect(summary).toMatch(/\|Enum Members\|400\|/);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
    });
  });

  describe("summaryMarkdownTable", () => {
    it("should transform an annotations summary to a markdown table", () => {
      const count = new AnnotationsCount();
      count.exports = 123;
      count.types = 456;
      count.duplicates = 789;
      count.namespaceMembers = 101112;
      count.enumMembers = 131415;

      // Behaviour
      expect(summaryMarkdownTable(count)).toMatchSnapshot();

      count.exports = 131415;
      count.types = 161718;
      count.duplicates = 192021;
      count.namespaceMembers = 222324;
      count.enumMembers = 252627;
      expect(summaryMarkdownTable(count)).toMatchSnapshot();

      // Logging
      assertNoneCalled();
    });
  });
});
