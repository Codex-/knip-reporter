import * as github from "@actions/github";
import type { EmitterWebhookEvent, WebhookEvents } from "@octokit/webhooks/types";

export function isEventType<T extends WebhookEvents>(
  context: typeof github.context,
  eventType: T,
): context is typeof github.context & EmitterWebhookEvent<T> {
  // Require the event's payload object, not just a matching name, so a partial
  // payload isn't narrowed to a shape it lacks. Assumes the data lives under a
  // key matching the event name (true for the events we handle).
  if (!context.payload[eventType]) {
    return false;
  }

  return context.eventName === eventType;
}
