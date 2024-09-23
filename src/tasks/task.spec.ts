import * as core from "@actions/core";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { timeTask } from "./task.ts";

vi.mock("@actions/core");

describe("task", () => {
  describe("timeTask", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("resolves to the resolved type of the task function", () => {
      expectTypeOf(timeTask("name", () => undefined)).resolves.toMatchTypeOf<undefined>();
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      expectTypeOf(timeTask("name", () => undefined)).resolves.toMatchTypeOf<void>();
      expectTypeOf(
        timeTask("name", () => Promise.resolve(undefined)),
      ).resolves.toMatchTypeOf<undefined>();
      expectTypeOf(
        timeTask("name", () => Promise.resolve(undefined)),
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      ).resolves.toMatchTypeOf<void>();
      expectTypeOf(timeTask("name", () => null)).resolves.toMatchTypeOf<null>();
      expectTypeOf(timeTask("name", () => Promise.resolve(null))).resolves.toMatchTypeOf<null>();
      expectTypeOf(timeTask("name", () => "")).resolves.toMatchTypeOf<string>();
      expectTypeOf(timeTask("name", () => Promise.resolve(""))).resolves.toMatchTypeOf<string>();
      expectTypeOf(timeTask("name", () => 0)).resolves.toMatchTypeOf<number>();
      expectTypeOf(timeTask("name", () => Promise.resolve(0))).resolves.toMatchTypeOf<number>();
    });

    it("should output the task name", async () => {
      const coreInfoSpy = vi.spyOn(core, "info").mockImplementation(() => undefined);
      await timeTask("Test Name", () => Promise.resolve(undefined));

      expect(coreInfoSpy).toHaveBeenCalledTimes(2);
      for (const [param] of coreInfoSpy.mock.calls) {
        expect(param).toContain("Test Name");
      }
    });

    it("should output the time taken", async () => {
      const coreInfoSpy = vi.spyOn(core, "info").mockImplementation(() => undefined);
      await timeTask("Test Name", () => Promise.resolve(undefined));

      expect(coreInfoSpy.mock.lastCall![0]).toMatch(/\(\d+ms\)/);
    });

    it("should return the value returned by the provided function", async () => {
      const expectedResult = "Magic Result";
      const result = await timeTask("Test Name", () => expectedResult);

      expect(result).toStrictEqual(expectedResult);
    });

    it("should return the resolved value returned by the provided function", async () => {
      const expectedResult = "Magic Result";
      const result = await timeTask("Test Name", () => Promise.resolve(expectedResult));

      expect(result).toStrictEqual(expectedResult);
    });
  });
});
