/**
 * Types exist here to prevent strange or circular dependencies.
 */

export interface ItemMeta {
  path: string;
  identifier: string;
  start_line: number;
  start_column: number;
  type: "class" | "enum" | "export";
}
