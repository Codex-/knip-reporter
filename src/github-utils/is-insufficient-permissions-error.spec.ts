import { describe, expect, it } from "vitest";

import { isInsufficientPermissionsError } from "./is-insufficient-permissions-error.ts";

describe("isInsufficientPermissionsError", () => {
  it("returns true for a 403 'Resource not accessible by integration' error", () => {
    expect(
      isInsufficientPermissionsError({
        status: 403,
        message: "Resource not accessible by integration",
      }),
    ).toStrictEqual(true);
  });

  it("returns true for a 403 'Resource not accessible by personal access token' error", () => {
    expect(
      isInsufficientPermissionsError({
        status: 403,
        message: "Resource not accessible by personal access token",
      }),
    ).toStrictEqual(true);
  });

  it("returns true when a permissions 403 is wrapped as a cause", () => {
    const error = new Error("Failed to create check", {
      cause: { status: 403, message: "Resource not accessible by integration" },
    });

    expect(isInsufficientPermissionsError(error)).toStrictEqual(true);
  });

  it("returns false for a 403 that is not a permissions error", () => {
    expect(
      isInsufficientPermissionsError({
        status: 403,
        message: "You have exceeded a secondary rate limit. Please wait a few minutes.",
      }),
    ).toStrictEqual(false);
  });

  it("returns false for other status codes", () => {
    expect(
      isInsufficientPermissionsError({
        status: 422,
        message: "Resource not accessible by integration",
      }),
    ).toStrictEqual(false);
  });

  it("returns false for a non-http error", () => {
    expect(isInsufficientPermissionsError(new Error("boom"))).toStrictEqual(false);
  });

  it("terminates on a cyclic cause chain", () => {
    const outer = new Error("outer");
    const inner = new Error("inner", { cause: outer });
    outer.cause = inner;

    expect(isInsufficientPermissionsError(outer)).toStrictEqual(false);
  });

  it("returns false for null/undefined", () => {
    expect(isInsufficientPermissionsError(null)).toStrictEqual(false);
    expect(isInsufficientPermissionsError(undefined)).toStrictEqual(false);
  });
});
