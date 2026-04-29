import { afterAll, afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { timeTask } from "./task.ts";
import { mockLoggingFunctions } from "../test-utils/logging.mock.ts";

vi.mock("@actions/core");

describe("task", () => {
  const { coreInfoLogMock, assertOnlyCalled } = mockLoggingFunctions();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("timeTask", () => {
    it("resolves to the resolved type of the task function", () => {
      expectTypeOf(timeTask("name", () => undefined)).resolves.toEqualTypeOf<undefined>();
      expectTypeOf(
        timeTask("name", () => Promise.resolve(undefined)),
      ).resolves.toEqualTypeOf<undefined>();
      expectTypeOf(timeTask("name", () => null)).resolves.toEqualTypeOf<null>();
      expectTypeOf(timeTask("name", () => Promise.resolve(null))).resolves.toEqualTypeOf<null>();
      expectTypeOf(timeTask("name", () => "")).resolves.toEqualTypeOf<string>();
      expectTypeOf(timeTask("name", () => Promise.resolve(""))).resolves.toEqualTypeOf<string>();
      expectTypeOf(timeTask("name", () => 0)).resolves.toEqualTypeOf<number>();
      expectTypeOf(timeTask("name", () => Promise.resolve(0))).resolves.toEqualTypeOf<number>();
    });

    it("should output the task name", async () => {
      await timeTask("Test Name", () => Promise.resolve(undefined));

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledTimes(2);
      for (const [param] of coreInfoLogMock.mock.calls) {
        expect(param).toContain("Test Name");
      }
    });

    it("should output the time taken", async () => {
      await timeTask("Test Name", () => Promise.resolve(undefined));

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock.mock.lastCall![0]).toMatch(/\(\d+ms\)/);
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
