import * as github from "@actions/github";
import type { EmitterWebhookEvent, WebhookEvents } from "@octokit/webhooks/types";

export function isEventType<T extends WebhookEvents>(
  context: typeof github.context,
  eventType: T,
): context is typeof github.context & EmitterWebhookEvent<T> {
  return context.eventName === eventType;
}
