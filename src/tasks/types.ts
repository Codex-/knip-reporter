/**
 * Types exist here to prevent strange or circular dependencies.
 */

interface ItemMetaBase {
  path: string;
  identifier: string;
  start_line: number;
  start_column: number;
  type: "export" | "type" | "class" | "enum";
}

type ItemMetaDuplicate = Omit<ItemMetaBase, "type"> & {
  type: "duplicate";
  duplicateIdentifiers: string[];
};

export type ItemMeta = ItemMetaBase | ItemMetaDuplicate;
