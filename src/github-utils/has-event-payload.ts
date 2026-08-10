import * as github from "@actions/github";
import type { WebhookEventMap } from "@octokit/webhooks-types";

export function hasEventPayload<T extends "pull_request" | "workflow_run">(
  context: typeof github.context,
  eventType: T,
): context is typeof github.context & { payload: WebhookEventMap[T] } {
  // Match on the payload, not `context.eventName`, so events like
  // pull_request_target (a `pull_request` payload under another name) report.
  return Boolean(context.payload[eventType]);
}
