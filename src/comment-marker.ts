/**
 * Hidden HTML comment that identifies a report comment and its position in
 * the report, with `n` the zero-based comment index.
 */
export function createCommentMarker(cfgCommentId: string, n: number): string {
  return `<!-- ${cfgCommentId}-${n} -->`;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `body` carries a marker for `cfgCommentId`.
 *
 * Matches the whole marker rather than the bare id. Matched comments are
 * overwritten or deleted, so a human comment that merely mentions the id, or
 * another workflow whose id starts with this one, must not be claimed.
 */
export function hasCommentMarker(body: string, cfgCommentId: string): boolean {
  const marker = new RegExp(`<!-- ${escapeRegExp(cfgCommentId)}-\\d+ -->`);
  return marker.test(body);
}
