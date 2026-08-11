/**
 * Types exist here to prevent strange or circular dependencies.
 */

interface ItemMetaBase {
  path: string;
  identifier: string;
  start_line: number;
  start_column: number;
  type: "export" | "type" | "namespace" | "enum";
}

type ItemMetaDuplicate = Omit<ItemMetaBase, "type"> & {
  type: "duplicate";
  duplicateIdentifiers: string[];
};

export type ItemMeta = ItemMetaBase | ItemMetaDuplicate;

export const COLLAPSE_SECTIONS_VALUES = ["auto", "always", "never"] as const;

/**
 * When to hide a report section's body behind a collapsible block.
 *
 * `auto` collapses only the sections large enough to crowd out the rest of
 * the report.
 */
export type CollapseSections = (typeof COLLAPSE_SECTIONS_VALUES)[number];
