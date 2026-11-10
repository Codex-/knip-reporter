import { describe, expect, it } from "vitest";

import { createCommentMarker, hasCommentMarker } from "./comment-marker.ts";

describe("comment-marker", () => {
  it("should round-trip a generated marker", () => {
    const body = `${createCommentMarker("ci-knip-reporter", 3)}\n\n### Unused files (1)`;
    expect(hasCommentMarker(body, "ci-knip-reporter")).toBe(true);
  });

  it("should treat regex metacharacters in the id literally", () => {
    const id = "release (v1.*)+knip";
    expect(hasCommentMarker(createCommentMarker(id, 0), id)).toBe(true);
    expect(hasCommentMarker(createCommentMarker("release (v1x)+knip", 0), id)).toBe(false);
  });

  it("should not match the bare id, a prefix id, or a marker without an index", () => {
    expect(hasCommentMarker("knip found issues", "knip")).toBe(false);
    expect(hasCommentMarker("<!-- knip-extra-0 -->", "knip")).toBe(false);
    expect(hasCommentMarker("<!-- knip- -->", "knip")).toBe(false);
  });
});
