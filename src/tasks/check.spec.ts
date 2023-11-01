import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

import * as api from "../api.ts";
import {
  type Annotation,
  CHECK_ANNOTATIONS_UPDATE_LIMIT,
  createCheckId,
  updateCheckAnnotations,
} from "./check.ts";
import type { ItemMeta } from "./types.ts";

vi.mock("@actions/core");
vi.mock("../api.ts");

describe("check", () => {
  describe("createCheckId", () => {
    it("should return the ID of a newly created Check", async () => {
      const createCheckSpy = vi
        .spyOn(api, "createCheck")
        .mockResolvedValue({ data: { id: 123 } } as any);
      const id = await createCheckId("testName", "testTitle");

      expect(id).toStrictEqual(123);
      expect(createCheckSpy).toHaveBeenCalledOnce();
      expect(createCheckSpy.mock.lastCall![0]).toStrictEqual("testName");
      expect(createCheckSpy.mock.lastCall![1]).toStrictEqual("testTitle");
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
          type: "class",
        },
      ];

      await updateCheckAnnotations(0, items, false);

      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations).toMatchSnapshot();
    });

    it("should output a warning annotation if ignoreResults is enabled", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "class",
        },
      ];

      await updateCheckAnnotations(0, items, true);

      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations![0]?.annotation_level).toStrictEqual(
        "warning",
      );
    });

    it("should output a failure annotation if ignoreResults is disabled", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "class",
        },
      ];

      await updateCheckAnnotations(0, items, false);

      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall?.[2]?.annotations![0]?.annotation_level).toStrictEqual(
        "failure",
      );
    });

    it("should skip undefined or null ItemMeta entries", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "class",
        },
        null as unknown as ItemMeta,
        undefined as unknown as ItemMeta,
      ];

      await updateCheckAnnotations(0, items, false);

      expect(updateCheckSpy).toHaveBeenCalledOnce();
      expect(updateCheckSpy.mock.lastCall).toMatchSnapshot();
    });

    it("should not make any calls if there are no ItemMeta entries", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [];

      await updateCheckAnnotations(0, items, false);

      expect(updateCheckSpy).not.toHaveBeenCalled();
    });

    it("should output counts for annotations", async () => {
      const items: ItemMeta[] = [
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "class",
        },
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "enum",
        },
      ];

      let counts = await updateCheckAnnotations(0, items, false);

      expect(counts.classMembers).toStrictEqual(1);
      expect(counts.enumMembers).toStrictEqual(1);

      items.push({
        path: "some/path",
        identifier: "Var",
        start_line: 0,
        start_column: 0,
        type: "class",
      });

      counts = await updateCheckAnnotations(0, items, false);

      expect(counts.classMembers).toStrictEqual(2);
      expect(counts.enumMembers).toStrictEqual(1);

      items.push(
        {
          path: "some/path",
          identifier: "Var",
          start_line: 0,
          start_column: 0,
          type: "class",
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

      expect(counts.classMembers).toStrictEqual(3);
      expect(counts.enumMembers).toStrictEqual(2);
    });

    it("should only make one request with 50 annotations or less", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [...Array(50).keys()].map(() => ({
        path: "some/path",
        identifier: "Var",
        start_line: 0,
        start_column: 0,
        type: "class",
      }));

      await updateCheckAnnotations(0, items, false);

      expect(updateCheckSpy).toHaveBeenCalledOnce();
    });

    it("should only make three requests with 150 annotations", async () => {
      const updateCheckSpy = vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [...Array(150).keys()].map((i) => ({
        path: "some/path",
        identifier: `Var${i}`,
        start_line: 0,
        start_column: 0,
        type: i % 2 ? "class" : "enum",
      }));

      await updateCheckAnnotations(0, items, false);

      expect(updateCheckSpy).toHaveBeenCalledTimes(3);
      for (const call of updateCheckSpy.mock.calls) {
        expect(call[2]?.annotations?.length).toBeLessThanOrEqual(CHECK_ANNOTATIONS_UPDATE_LIMIT);
      }
      expect(updateCheckSpy.mock.calls).toMatchSnapshot();
    });

    it("should send all items provided", async () => {
      const pushedAnnotations: Annotation[] = [];
      vi.spyOn(api, "updateCheck").mockImplementation((async (
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
        type: i % 2 ? "class" : "enum",
      }));

      await updateCheckAnnotations(0, items, false);

      expect(pushedAnnotations).toHaveLength(items.length);
      for (let i = 0; i < items.length; i++) {
        expect(pushedAnnotations[i]?.message).toContain(items[i]?.identifier);
      }
    });

    it("should accurately report the count to the debug logger", async () => {
      const countLogs: string[] = [];
      vi.spyOn(core, "debug").mockImplementation((msg: string) => {
        if (/Processing/.test(msg)) {
          countLogs.push(msg);
        }
      });
      vi.spyOn(api, "updateCheck");
      const items: ItemMeta[] = [...Array(130).keys()].map((i) => ({
        path: "some/path",
        identifier: `Var${i}`,
        start_line: 0,
        start_column: 0,
        type: i % 2 ? "class" : "enum",
      }));

      await updateCheckAnnotations(0, items, false);

      expect(countLogs).toHaveLength(3);
      expect(countLogs[0]).toMatch(/Processing 0...49/);
      expect(countLogs[1]).toMatch(/Processing 50...99/);
      expect(countLogs[2]).toMatch(/Processing 100...129/);
    });
  });
});
