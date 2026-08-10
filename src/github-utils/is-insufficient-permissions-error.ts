// A read-only GITHUB_TOKEN (e.g. a `pull_request` run triggered from a fork)
// rejects write calls with 403 "Resource not accessible by integration" (or
// "... by personal access token"). Require the message as well as the status:
// GitHub also 403s for rate limits and org policies, which should not be
// mistaken for a missing permission. Walk the cause chain since our API
// wrappers rethrow with the octokit error as `cause`.
export function isInsufficientPermissionsError(error: unknown): boolean {
  let current: unknown = error;
  // A cause can be any object, so the chain isn't guaranteed to be acyclic.
  const seen = new Set<object>();

  while (current !== null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);

    const { status, message } = current as { status?: unknown; message?: unknown };
    if (
      status === 403 &&
      typeof message === "string" &&
      message.includes("Resource not accessible")
    ) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
