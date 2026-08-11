import * as core from "@actions/core";

/**
 * Total calls per operation, so `MAX_ATTEMPTS - 1` retries.
 */
const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 1_000;

/**
 * A primary rate limit can reset up to an hour out. Sleeping that long would
 * burn the job's budget for no benefit, so we fail instead of waiting.
 */
const MAX_DELAY_MS = 30_000;

/**
 * Close-enough recreation of the error type Octokit throws for a failed
 * request, including ones that never reach GitHub.
 */
interface HttpError extends Error {
  status: number;
  response?: { headers: Record<string, string | undefined> };
}

function isHttpError(error: unknown): error is HttpError {
  // Narrow on the name rather than the `@octokit/request-error` prototype.
  // Depending on that package directly risks bundling it alongside the
  // transitive copy, which makes `instanceof` unreliable.
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

/**
 * Rate limiting is reported as a 403 or a 429, identified by an exhausted
 * remaining count or by being told when to try again.
 * See: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit
 */
function isRateLimited(error: HttpError): boolean {
  const headers = error.response?.headers;
  return headers?.["retry-after"] !== undefined || headers?.["x-ratelimit-remaining"] === "0";
}

/**
 * Whether a failed request could plausibly succeed if it were tried again.
 */
function isRetryable(error: HttpError): boolean {
  if (error.status >= 500 || error.status === 429) {
    return true;
  }

  // A 403 is either a rate limit or a permission problem, and only the former
  // resolves itself. `isInsufficientPermissionsError` relies on a permission
  // 403 reaching the caller unchanged.
  return error.status === 403 && isRateLimited(error);
}

/**
 * How long to wait before the next attempt.
 *
 * GitHub's own hint wins where present, as it is the only reliable signal for
 * a secondary rate limit. An exhausted primary limit only clears at its reset
 * time, so backing off ahead of that just wastes attempts.
 */
function retryDelayMs(error: HttpError, retry: number): number {
  const headers = error.response?.headers;

  const retryAfterSeconds = Number.parseInt(headers?.["retry-after"] ?? "", 10);
  if (!Number.isNaN(retryAfterSeconds)) {
    return retryAfterSeconds * 1000;
  }

  if (headers?.["x-ratelimit-remaining"] === "0") {
    const resetSeconds = Number.parseInt(headers["x-ratelimit-reset"] ?? "", 10);
    if (!Number.isNaN(resetSeconds)) {
      return resetSeconds * 1000 - Date.now();
    }
  }

  return BASE_DELAY_MS * 2 ** retry;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry `operation` while GitHub reports a failure another attempt could
 * plausibly clear: a 5xx, a 429, or a rate-limited 403.
 *
 * Everything else propagates from the first attempt, including the 403 a
 * read-only token produces, so callers can still classify it.
 *
 * Writes are retried too. A 5xx leaves it ambiguous whether the request
 * applied, but the comment task reconciles against the comments already on the
 * pull request, so a duplicate from a lost response is corrected next run.
 *
 * `operation` must be self-contained, as a retry re-runs it from the start.
 * Anything it accumulates has to be built inside it rather than around it.
 */
export async function withRetry<T>(name: string, operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_ATTEMPTS) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt++;

      if (attempt >= MAX_ATTEMPTS || !isHttpError(error) || !isRetryable(error)) {
        break;
      }

      const delayMs = retryDelayMs(error, attempt - 1);
      if (delayMs > MAX_DELAY_MS) {
        core.warning(
          `[${name}]: Request failed with ${error.status} and cannot be retried for ` +
            `another ${Math.round(delayMs / 1000)}s, giving up`,
        );
        break;
      }

      core.warning(
        `[${name}]: Request failed with ${error.status}, retrying in ${delayMs}ms ` +
          `(retry ${attempt} of ${MAX_ATTEMPTS - 1})`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
