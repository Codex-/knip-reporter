import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withRetry } from "./with-retry.ts";
import { mockLoggingFunctions } from "../test-utils/logging.mock.ts";

vi.mock("@actions/core");

interface HttpErrorInit {
  status: number;
  headers?: Record<string, string>;
}

function httpError({ status, headers }: HttpErrorInit): Error {
  const error = new Error(`HTTP ${status}`);
  error.name = "HttpError";
  return Object.assign(error, {
    status,
    response: headers === undefined ? undefined : { headers },
  });
}

describe("withRetry", () => {
  const { coreWarningLogMock, assertOnlyCalled, assertNoneCalled } = mockLoggingFunctions();

  beforeEach(() => {
    vi.useFakeTimers();
    // An exact second boundary, so a delay derived from `x-ratelimit-reset`
    // (which has second granularity) lands on a whole number of milliseconds.
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  /**
   * The retry sleeps on fake timers, so the pending timer has to be advanced
   * while the operation promise is still in flight. Both are awaited as one
   * promise, otherwise an immediate rejection surfaces as an unhandled one.
   */
  function runWithTimers<T>(operation: () => Promise<T>): Promise<T> {
    return Promise.all([withRetry("test", operation), vi.runAllTimersAsync()]).then(
      ([result]) => result,
    );
  }

  it("returns the result without retrying when the operation succeeds", async () => {
    const operation = vi.fn().mockResolvedValue("ok");

    // Behaviour
    await expect(runWithTimers(operation)).resolves.toStrictEqual("ok");
    expect(operation).toHaveBeenCalledOnce();

    // Logging
    assertNoneCalled();
  });

  it("retries a 500 and returns the eventual success", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(httpError({ status: 500 }))
      .mockResolvedValue("ok");

    // Behaviour
    await expect(runWithTimers(operation)).resolves.toStrictEqual("ok");
    expect(operation).toHaveBeenCalledTimes(2);

    // Logging
    assertOnlyCalled(coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledOnce();
    expect(coreWarningLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
      `"[test]: Request failed with 500, retrying in 1000ms (retry 1 of 2)"`,
    );
  });

  it("gives up after the attempt limit and throws the last error", async () => {
    const error = httpError({ status: 502 });
    const operation = vi.fn().mockRejectedValue(error);

    // Behaviour
    await expect(runWithTimers(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);

    // Logging
    assertOnlyCalled(coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledTimes(2);
    expect(coreWarningLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(
      `"[test]: Request failed with 502, retrying in 2000ms (retry 2 of 2)"`,
    );
  });

  it("retries a 429", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(httpError({ status: 429 }))
      .mockResolvedValue("ok");

    // Behaviour
    await expect(runWithTimers(operation)).resolves.toStrictEqual("ok");
    expect(operation).toHaveBeenCalledTimes(2);

    // Logging
    assertOnlyCalled(coreWarningLogMock);
  });

  it("retries a rate-limited 403 but not a permissions 403", async () => {
    const rateLimited = vi
      .fn()
      .mockRejectedValueOnce(httpError({ status: 403, headers: { "retry-after": "2" } }))
      .mockResolvedValue("ok");

    // Behaviour
    await expect(runWithTimers(rateLimited)).resolves.toStrictEqual("ok");
    expect(rateLimited).toHaveBeenCalledTimes(2);
    expect(coreWarningLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
      `"[test]: Request failed with 403, retrying in 2000ms (retry 1 of 2)"`,
    );

    const permissions = vi.fn().mockRejectedValue(httpError({ status: 403 }));
    await expect(runWithTimers(permissions)).rejects.toMatchObject({ status: 403 });
    expect(permissions).toHaveBeenCalledOnce();

    // Logging
    assertOnlyCalled(coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledOnce();
  });

  it("does not retry a 422 or a non-http error", async () => {
    const unprocessable = vi.fn().mockRejectedValue(httpError({ status: 422 }));
    const plain = vi.fn().mockRejectedValue(new Error("boom"));

    // Behaviour
    await expect(runWithTimers(unprocessable)).rejects.toMatchObject({ status: 422 });
    expect(unprocessable).toHaveBeenCalledOnce();
    await expect(runWithTimers(plain)).rejects.toThrow("boom");
    expect(plain).toHaveBeenCalledOnce();

    // Logging
    assertNoneCalled();
  });

  it("waits until the primary rate limit resets when that is soon enough", async () => {
    const resetSeconds = Math.floor(Date.now() / 1000) + 5;
    const operation = vi
      .fn()
      .mockRejectedValueOnce(
        httpError({
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": `${resetSeconds}` },
        }),
      )
      .mockResolvedValue("ok");

    // Behaviour
    await expect(runWithTimers(operation)).resolves.toStrictEqual("ok");
    expect(operation).toHaveBeenCalledTimes(2);

    // Logging
    assertOnlyCalled(coreWarningLogMock);
    expect(coreWarningLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
      `"[test]: Request failed with 403, retrying in 5000ms (retry 1 of 2)"`,
    );
  });

  it("gives up rather than sleeping past the delay ceiling", async () => {
    const error = httpError({ status: 429, headers: { "retry-after": "3600" } });
    const operation = vi.fn().mockRejectedValue(error);

    // Behaviour
    await expect(runWithTimers(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();

    // Logging
    assertOnlyCalled(coreWarningLogMock);
    expect(coreWarningLogMock).toHaveBeenCalledOnce();
    expect(coreWarningLogMock.mock.lastCall?.[0]).toMatchInlineSnapshot(
      `"[test]: Request failed with 429 and cannot be retried for another 3600s, giving up"`,
    );
  });
});
